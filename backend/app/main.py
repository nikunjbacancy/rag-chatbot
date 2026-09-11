import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.services.document_processor import DocumentProcessor
from app.services.embeddings import EmbeddingService
from app.services.generation import GenerationService
from app.services.retrieval import RetrievalService

# ------------------------------------------------------------------ #
# Logging                                                              #
# ------------------------------------------------------------------ #
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
# Service singletons (populated in lifespan)                          #
# ------------------------------------------------------------------ #
document_processor: DocumentProcessor = None  # type: ignore[assignment]
embedding_service: EmbeddingService = None  # type: ignore[assignment]
retrieval_service: RetrievalService = None  # type: ignore[assignment]
generation_service: GenerationService = None  # type: ignore[assignment]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    global document_processor, embedding_service, retrieval_service, generation_service

    # Create required directories
    Path(settings.uploads_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.chroma_persist_dir).mkdir(parents=True, exist_ok=True)
    logger.info("Directories ready: uploads=%s, chroma=%s", settings.uploads_dir, settings.chroma_persist_dir)

    # Initialise services
    logger.info("Loading document processor …")
    document_processor = DocumentProcessor()

    logger.info("Loading embedding model '%s' …", settings.embedding_model)
    embedding_service = EmbeddingService(model_name=settings.embedding_model)

    logger.info("Initialising retrieval service …")
    retrieval_service = RetrievalService(embedding_service=embedding_service)

    logger.info("Initialising generation service …")
    generation_service = GenerationService()

    # Restore persisted document metadata
    from app.api.documents import load_store
    load_store()

    logger.info("All services initialised. RAG chatbot is ready.")
    yield

    # Shutdown — nothing special needed; ChromaDB persists automatically
    logger.info("Shutting down RAG chatbot.")


# ------------------------------------------------------------------ #
# App factory                                                          #
# ------------------------------------------------------------------ #
app = FastAPI(
    title="RAG Chatbot API",
    description="Retrieval-Augmented Generation chatbot with hybrid search.",
    version="1.0.0",
    lifespan=lifespan,
    redirect_slashes=False,
)

# CORS — allow the Next.js dev server and production origin
_origins = [o.strip() for o in settings.cors_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Conversation-Id"],
)

# ------------------------------------------------------------------ #
# Routers                                                              #
# ------------------------------------------------------------------ #
from app.api.documents import router as documents_router  # noqa: E402
from app.api.chat import router as chat_router  # noqa: E402

app.include_router(documents_router)
app.include_router(chat_router)


# ------------------------------------------------------------------ #
# Health check                                                         #
# ------------------------------------------------------------------ #
@app.get("/health", tags=["health"])
async def health_check():
    """Simple health probe."""
    stats = retrieval_service.get_collection_stats() if retrieval_service else {}
    return {
        "status": "ok",
        "model": settings.gemini_model,
        "embedding_model": settings.embedding_model,
        "collection_stats": stats,
    }
