import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, Any

import aiofiles
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile, File, status

from app.core.config import settings
from app.models.schemas import (
    DeleteResponse,
    DocumentListResponse,
    DocumentResponse,
    DocumentStatus,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/documents", tags=["documents"], redirect_slashes=False)

# ------------------------------------------------------------------ #
# Document metadata store (in-memory, persisted to JSON on disk)      #
# ------------------------------------------------------------------ #
_documents: Dict[str, Dict[str, Any]] = {}
_store_path: Path = Path(settings.chroma_persist_dir) / "documents.json"

SUPPORTED_EXTENSIONS = {"pdf", "docx", "txt", "md", "csv"}
MIME_TO_EXT = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv",
    "application/csv": "csv",
}

# ------------------------------------------------------------------ #
# Persistence helpers                                                  #
# ------------------------------------------------------------------ #

def _save_store() -> None:
    """Serialize _documents to JSON on disk."""
    try:
        serializable: Dict[str, Any] = {}
        for doc_id, doc in _documents.items():
            row = dict(doc)
            if isinstance(row.get("created_at"), datetime):
                row["created_at"] = row["created_at"].isoformat()
            if isinstance(row.get("status"), DocumentStatus):
                row["status"] = row["status"].value
            serializable[doc_id] = row
        _store_path.parent.mkdir(parents=True, exist_ok=True)
        _store_path.write_text(json.dumps(serializable, indent=2))
    except Exception as exc:
        logger.warning("Could not save document store: %s", exc)


def load_store() -> None:
    """Load persisted document metadata from disk into _documents. Called at startup."""
    if not _store_path.exists():
        logger.info("No persisted document store found — starting fresh.")
        return
    try:
        data: Dict[str, Any] = json.loads(_store_path.read_text())
        for doc_id, row in data.items():
            if isinstance(row.get("created_at"), str):
                row["created_at"] = datetime.fromisoformat(row["created_at"])
            if isinstance(row.get("status"), str):
                row["status"] = DocumentStatus(row["status"])
            _documents[doc_id] = row
        logger.info("Restored %d document(s) from persistent store.", len(_documents))
    except Exception as exc:
        logger.warning("Could not load document store: %s", exc)


def get_documents_store() -> Dict[str, Dict[str, Any]]:
    """Expose the store so other modules (e.g. chat) can read it."""
    return _documents


# ------------------------------------------------------------------ #
# Background processing task                                           #
# ------------------------------------------------------------------ #

async def _process_document_background(doc_id: str, file_path: Path, filename: str) -> None:
    """Parse, chunk, embed and index a document; update status in-place."""
    from app.main import document_processor, embedding_service, retrieval_service

    try:
        _documents[doc_id]["status"] = DocumentStatus.processing
        _save_store()

        chunks = await document_processor.process_document(
            file_path=file_path,
            doc_id=doc_id,
            filename=filename,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

        if not chunks:
            raise ValueError("No chunks produced from document.")

        texts = [c["text"] for c in chunks]
        embeddings = embedding_service.embed_texts(texts)
        retrieval_service.add_chunks(doc_id=doc_id, chunks=chunks, embeddings=embeddings)

        _documents[doc_id]["status"] = DocumentStatus.ready
        _documents[doc_id]["chunk_count"] = len(chunks)
        _save_store()
        logger.info("Document %s (%s) processed: %d chunks", doc_id, filename, len(chunks))

    except Exception as exc:
        logger.error("Processing failed for %s: %s", doc_id, exc, exc_info=True)
        _documents[doc_id]["status"] = DocumentStatus.failed
        _documents[doc_id]["error_message"] = str(exc)
        _save_store()


# ------------------------------------------------------------------ #
# Endpoints                                                            #
# ------------------------------------------------------------------ #

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    original_name = file.filename or "unknown"
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    content = await file.read()
    size_bytes = len(content)
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_file_size_mb} MB.",
        )

    doc_id = str(uuid.uuid4())
    uploads_path = Path(settings.uploads_dir)
    uploads_path.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{doc_id}_{original_name}"
    file_path = uploads_path / safe_filename

    async with aiofiles.open(file_path, "wb") as out:
        await out.write(content)

    now = datetime.utcnow()
    _documents[doc_id] = {
        "id": doc_id,
        "filename": original_name,
        "file_type": ext,
        "status": DocumentStatus.processing,
        "chunk_count": 0,
        "created_at": now,
        "size_bytes": size_bytes,
        "file_path": str(file_path),
        "error_message": None,
    }
    _save_store()

    background_tasks.add_task(_process_document_background, doc_id, file_path, original_name)
    logger.info("Document %s (%s) queued for processing", doc_id, original_name)

    return DocumentResponse(**{k: v for k, v in _documents[doc_id].items() if k != "file_path"})


@router.get("/", response_model=DocumentListResponse)
async def list_documents():
    docs = [
        DocumentResponse(**{k: v for k, v in doc.items() if k != "file_path"})
        for doc in _documents.values()
    ]
    docs.sort(key=lambda d: d.created_at, reverse=True)
    return DocumentListResponse(documents=docs, total=len(docs))


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str):
    doc = _documents.get(doc_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return DocumentResponse(**{k: v for k, v in doc.items() if k != "file_path"})


@router.delete("/{doc_id}", response_model=DeleteResponse)
async def delete_document(doc_id: str):
    doc = _documents.get(doc_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    from app.main import retrieval_service

    try:
        retrieval_service.delete_document(doc_id)
    except Exception as exc:
        logger.warning("Could not fully remove chunks for %s: %s", doc_id, exc)

    file_path = Path(doc.get("file_path", ""))
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception as exc:
            logger.warning("Could not delete file %s: %s", file_path, exc)

    del _documents[doc_id]
    _save_store()
    logger.info("Document %s deleted", doc_id)

    return DeleteResponse(success=True, message=f"Document '{doc['filename']}' deleted successfully.")
