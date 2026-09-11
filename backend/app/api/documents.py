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
router = APIRouter(prefix="/api/documents", tags=["documents"])

# ------------------------------------------------------------------ #
# In-memory document metadata store                                    #
# { doc_id: DocumentRecord dict }                                      #
# ------------------------------------------------------------------ #
_documents: Dict[str, Dict[str, Any]] = {}

SUPPORTED_EXTENSIONS = {"pdf", "docx", "txt", "md", "csv"}
MIME_TO_EXT = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "text/plain": "txt",
    "text/markdown": "md",
    "text/csv": "csv",
    "application/csv": "csv",
}


def get_documents_store() -> Dict[str, Dict[str, Any]]:
    """Expose the in-memory store so other modules (e.g. chat) can read it."""
    return _documents


# ------------------------------------------------------------------ #
# Background processing task                                           #
# ------------------------------------------------------------------ #

async def _process_document_background(doc_id: str, file_path: Path, filename: str) -> None:
    """Parse, chunk, embed and index a document; update status in-place."""
    from app.main import document_processor, embedding_service, retrieval_service  # lazy import

    try:
        _documents[doc_id]["status"] = DocumentStatus.processing

        # 1. Parse & chunk
        chunks = await document_processor.process_document(
            file_path=file_path,
            doc_id=doc_id,
            filename=filename,
            chunk_size=settings.chunk_size,
            chunk_overlap=settings.chunk_overlap,
        )

        if not chunks:
            raise ValueError("No chunks produced from document.")

        # 2. Embed
        texts = [c["text"] for c in chunks]
        embeddings = embedding_service.embed_texts(texts)

        # 3. Store in vector DB + BM25
        retrieval_service.add_chunks(doc_id=doc_id, chunks=chunks, embeddings=embeddings)

        # 4. Update metadata
        _documents[doc_id]["status"] = DocumentStatus.ready
        _documents[doc_id]["chunk_count"] = len(chunks)
        logger.info("Document %s (%s) processed successfully: %d chunks", doc_id, filename, len(chunks))

    except Exception as exc:
        logger.error("Processing failed for document %s: %s", doc_id, exc, exc_info=True)
        _documents[doc_id]["status"] = DocumentStatus.failed
        _documents[doc_id]["error_message"] = str(exc)


# ------------------------------------------------------------------ #
# Endpoints                                                            #
# ------------------------------------------------------------------ #

@router.post("/upload", response_model=DocumentResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """Accept a file upload, save it to disk, and kick off background processing."""
    # Validate extension
    original_name = file.filename or "unknown"
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    if ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type '{ext}'. Supported: {', '.join(sorted(SUPPORTED_EXTENSIONS))}",
        )

    # Read content and validate size
    content = await file.read()
    size_bytes = len(content)
    max_bytes = settings.max_file_size_mb * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum size of {settings.max_file_size_mb} MB.",
        )

    # Persist file
    doc_id = str(uuid.uuid4())
    uploads_path = Path(settings.uploads_dir)
    uploads_path.mkdir(parents=True, exist_ok=True)
    safe_filename = f"{doc_id}_{original_name}"
    file_path = uploads_path / safe_filename

    async with aiofiles.open(file_path, "wb") as out:
        await out.write(content)

    # Register in memory
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

    # Schedule background processing
    background_tasks.add_task(_process_document_background, doc_id, file_path, original_name)
    logger.info("Document %s (%s) queued for processing", doc_id, original_name)

    return DocumentResponse(**{k: v for k, v in _documents[doc_id].items() if k != "file_path"})


@router.get("/", response_model=DocumentListResponse)
async def list_documents():
    """Return all documents and their current status."""
    docs = [
        DocumentResponse(**{k: v for k, v in doc.items() if k != "file_path"})
        for doc in _documents.values()
    ]
    # Sort by creation time descending
    docs.sort(key=lambda d: d.created_at, reverse=True)
    return DocumentListResponse(documents=docs, total=len(docs))


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str):
    """Return metadata for a single document."""
    doc = _documents.get(doc_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return DocumentResponse(**{k: v for k, v in doc.items() if k != "file_path"})


@router.delete("/{doc_id}", response_model=DeleteResponse)
async def delete_document(doc_id: str):
    """Delete a document and remove all its chunks from the vector store."""
    doc = _documents.get(doc_id)
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")

    from app.main import retrieval_service  # lazy import to avoid circular

    # Remove from vector store
    try:
        retrieval_service.delete_document(doc_id)
    except Exception as exc:
        logger.warning("Could not fully remove chunks for %s: %s", doc_id, exc)

    # Delete file from disk
    file_path = Path(doc.get("file_path", ""))
    if file_path.exists():
        try:
            file_path.unlink()
        except Exception as exc:
            logger.warning("Could not delete file %s: %s", file_path, exc)

    # Remove from memory
    del _documents[doc_id]
    logger.info("Document %s deleted", doc_id)

    return DeleteResponse(success=True, message=f"Document '{doc['filename']}' deleted successfully.")
