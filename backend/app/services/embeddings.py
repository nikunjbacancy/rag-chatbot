import logging
from typing import List

from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Wraps ChromaDB's built-in ONNX embedding function (all-MiniLM-L6-v2).
    No torch required — uses onnxruntime under the hood.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2") -> None:
        logger.info("Loading ONNX embedding model: %s", model_name)
        self._fn = ONNXMiniLM_L6_V2()
        self.dimension = 384  # all-MiniLM-L6-v2 output dimension
        logger.info("Embedding model ready. Dimension: %d", self.dimension)

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        try:
            return self._fn(texts)
        except Exception as exc:
            logger.error("Batch embedding failed: %s", exc)
            raise

    def embed_query(self, query: str) -> List[float]:
        try:
            return self._fn([query])[0]
        except Exception as exc:
            logger.error("Query embedding failed: %s", exc)
            raise
