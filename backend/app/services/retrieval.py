import logging
import re
from collections import defaultdict
from typing import Any, Dict, List, Optional

import chromadb
from rank_bm25 import BM25Okapi

from app.core.config import settings
from app.services.embeddings import EmbeddingService

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
# Helpers                                                              #
# ------------------------------------------------------------------ #

def _simple_tokenize(text: str) -> List[str]:
    """Lowercase word tokenizer for BM25."""
    return re.findall(r"\b\w+\b", text.lower())


def _reciprocal_rank_fusion(
    ranked_lists: List[List[str]],
    k: int = 60,
) -> Dict[str, float]:
    """
    Merge multiple ranked lists using Reciprocal Rank Fusion.

    score(d) = sum_over_lists( 1 / (k + rank(d)) )
    """
    rrf_scores: Dict[str, float] = defaultdict(float)
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked, start=1):
            rrf_scores[doc_id] += 1.0 / (k + rank)
    return rrf_scores


# ------------------------------------------------------------------ #
# RetrievalService                                                     #
# ------------------------------------------------------------------ #

class RetrievalService:
    """Hybrid retrieval: dense (ChromaDB/cosine) + sparse (BM25) with RRF fusion."""

    def __init__(self, embedding_service: EmbeddingService) -> None:
        self.embedding_service = embedding_service

        # ChromaDB persistent client
        self.chroma_client = chromadb.PersistentClient(path=settings.chroma_persist_dir)
        self.collection = self.chroma_client.get_or_create_collection(
            name="rag_documents",
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "ChromaDB collection 'rag_documents' ready. Items: %d",
            self.collection.count(),
        )

        # BM25 state: per-document tokenised corpus
        # { doc_id: [tokenised_chunk_0, tokenised_chunk_1, ...] }
        self._bm25_corpus: Dict[str, List[List[str]]] = {}
        # { doc_id: [chunk_id_0, chunk_id_1, ...] }
        self._bm25_chunk_ids: Dict[str, List[str]] = {}
        # Global BM25 index rebuilt lazily
        self._global_bm25: Optional[BM25Okapi] = None
        self._global_chunk_ids: List[str] = []
        self._bm25_dirty: bool = True

        # Re-build BM25 from persisted ChromaDB on startup
        self._rebuild_bm25_from_chroma()

    # ------------------------------------------------------------------ #
    # BM25 management                                                      #
    # ------------------------------------------------------------------ #

    def _rebuild_bm25_from_chroma(self) -> None:
        """Load all chunks from ChromaDB to reconstruct the BM25 index."""
        try:
            count = self.collection.count()
            if count == 0:
                return
            result = self.collection.get(include=["documents", "metadatas"])
            ids: List[str] = result["ids"]
            docs: List[str] = result["documents"]
            metas: List[Dict] = result["metadatas"]

            # Group by doc_id
            per_doc: Dict[str, List] = defaultdict(list)
            for chunk_id, text, meta in zip(ids, docs, metas):
                doc_id = meta.get("doc_id", "unknown")
                per_doc[doc_id].append((chunk_id, text))

            for doc_id, items in per_doc.items():
                self._bm25_corpus[doc_id] = [_simple_tokenize(t) for _, t in items]
                self._bm25_chunk_ids[doc_id] = [cid for cid, _ in items]

            self._bm25_dirty = True
            logger.info("BM25 re-built from ChromaDB: %d chunks across %d docs", count, len(per_doc))
        except Exception as exc:
            logger.warning("Could not rebuild BM25 from ChromaDB: %s", exc)

    def _ensure_global_bm25(self) -> None:
        """Lazily rebuild the flat BM25 index across all documents."""
        if not self._bm25_dirty:
            return
        all_tokens: List[List[str]] = []
        all_ids: List[str] = []
        for doc_id, tokens_list in self._bm25_corpus.items():
            chunk_ids = self._bm25_chunk_ids.get(doc_id, [])
            for tid, tokens in zip(chunk_ids, tokens_list):
                all_ids.append(tid)
                all_tokens.append(tokens)

        if all_tokens:
            self._global_bm25 = BM25Okapi(all_tokens)
            self._global_chunk_ids = all_ids
        else:
            self._global_bm25 = None
            self._global_chunk_ids = []

        self._bm25_dirty = False

    # ------------------------------------------------------------------ #
    # Public API                                                           #
    # ------------------------------------------------------------------ #

    def add_chunks(
        self,
        doc_id: str,
        chunks: List[Dict[str, Any]],
        embeddings: List[List[float]],
    ) -> None:
        """
        Persist chunks in ChromaDB and update the BM25 index.

        chunks: list of {"text": str, "page": int, "chunk_index": int, ...}
        embeddings: parallel list of embedding vectors
        """
        if not chunks:
            return

        ids = [f"{doc_id}_chunk_{c['chunk_index']}" for c in chunks]
        documents = [c["text"] for c in chunks]
        metadatas = [
            {
                "doc_id": doc_id,
                "filename": c.get("filename", ""),
                "page": c.get("page", 1),
                "chunk_index": c.get("chunk_index", 0),
            }
            for c in chunks
        ]

        # Upsert into ChromaDB in batches to avoid size limits
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            self.collection.upsert(
                ids=ids[i : i + batch_size],
                embeddings=embeddings[i : i + batch_size],
                documents=documents[i : i + batch_size],
                metadatas=metadatas[i : i + batch_size],
            )

        # Update BM25
        self._bm25_corpus[doc_id] = [_simple_tokenize(t) for t in documents]
        self._bm25_chunk_ids[doc_id] = ids
        self._bm25_dirty = True
        logger.info("Added %d chunks for doc %s", len(chunks), doc_id)

    def delete_document(self, doc_id: str) -> None:
        """Remove all chunks for a document from ChromaDB and BM25."""
        try:
            # Find chunk IDs in ChromaDB
            result = self.collection.get(
                where={"doc_id": doc_id},
                include=[],
            )
            chunk_ids = result["ids"]
            if chunk_ids:
                self.collection.delete(ids=chunk_ids)
                logger.info("Deleted %d chunks from ChromaDB for doc %s", len(chunk_ids), doc_id)
        except Exception as exc:
            logger.warning("Error deleting from ChromaDB for doc %s: %s", doc_id, exc)

        # Remove from BM25
        self._bm25_corpus.pop(doc_id, None)
        self._bm25_chunk_ids.pop(doc_id, None)
        self._bm25_dirty = True

    def hybrid_search(
        self,
        query: str,
        query_embedding: List[float],
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Hybrid retrieval: vector search + BM25, merged via Reciprocal Rank Fusion.

        Returns up to top_k results, each dict:
            {
                "chunk_id": str,
                "text": str,
                "doc_id": str,
                "filename": str,
                "page": int,
                "chunk_index": int,
                "score": float,          # RRF score
                "vector_distance": float, # cosine distance (lower = better)
            }
        """
        n_candidates = min(top_k * 3, max(top_k, self.collection.count()))
        if n_candidates == 0:
            return []

        # ---- 1. Dense retrieval (ChromaDB cosine) ---- #
        dense_ids: List[str] = []
        dense_meta: Dict[str, Dict] = {}
        dense_docs: Dict[str, str] = {}
        dense_distances: Dict[str, float] = {}
        try:
            vector_result = self.collection.query(
                query_embeddings=[query_embedding],
                n_results=n_candidates,
                include=["documents", "metadatas", "distances"],
            )
            if vector_result["ids"] and vector_result["ids"][0]:
                for cid, doc, meta, dist in zip(
                    vector_result["ids"][0],
                    vector_result["documents"][0],
                    vector_result["metadatas"][0],
                    vector_result["distances"][0],
                ):
                    dense_ids.append(cid)
                    dense_meta[cid] = meta
                    dense_docs[cid] = doc
                    dense_distances[cid] = dist
        except Exception as exc:
            logger.warning("Dense retrieval failed: %s", exc)

        # ---- 2. Sparse retrieval (BM25) ---- #
        bm25_ids: List[str] = []
        self._ensure_global_bm25()
        if self._global_bm25 and self._global_chunk_ids:
            try:
                query_tokens = _simple_tokenize(query)
                scores = self._global_bm25.get_scores(query_tokens)
                # Get top n_candidates indices sorted by score descending
                sorted_indices = sorted(
                    range(len(scores)), key=lambda i: scores[i], reverse=True
                )[:n_candidates]
                bm25_ids = [self._global_chunk_ids[i] for i in sorted_indices if scores[i] > 0]
            except Exception as exc:
                logger.warning("BM25 retrieval failed: %s", exc)

        # ---- 3. Reciprocal Rank Fusion ---- #
        rrf_scores = _reciprocal_rank_fusion([dense_ids, bm25_ids], k=60)

        # Collect all unique IDs that appear in either list
        all_ids = list(rrf_scores.keys())
        if not all_ids:
            return []

        # Fetch metadata for IDs we don't have yet (from BM25 hits not in dense)
        missing_ids = [cid for cid in all_ids if cid not in dense_meta]
        if missing_ids:
            try:
                extra = self.collection.get(
                    ids=missing_ids,
                    include=["documents", "metadatas"],
                )
                for cid, doc, meta in zip(extra["ids"], extra["documents"], extra["metadatas"]):
                    dense_meta[cid] = meta
                    dense_docs[cid] = doc
            except Exception as exc:
                logger.warning("Could not fetch extra chunks: %s", exc)

        # ---- 4. Sort by RRF score and return top_k ---- #
        sorted_results = sorted(all_ids, key=lambda cid: rrf_scores[cid], reverse=True)[:top_k]

        results: List[Dict[str, Any]] = []
        for cid in sorted_results:
            meta = dense_meta.get(cid, {})
            text = dense_docs.get(cid, "")
            results.append(
                {
                    "chunk_id": cid,
                    "text": text,
                    "doc_id": meta.get("doc_id", ""),
                    "filename": meta.get("filename", ""),
                    "page": meta.get("page", None),
                    "chunk_index": meta.get("chunk_index", 0),
                    "score": rrf_scores[cid],
                    "vector_distance": dense_distances.get(cid, 1.0),
                }
            )

        return results

    def get_document_chunks(self, doc_id: str) -> List[Dict[str, Any]]:
        """Return all chunks stored for a given document ID."""
        try:
            result = self.collection.get(
                where={"doc_id": doc_id},
                include=["documents", "metadatas"],
            )
            chunks = []
            for cid, doc, meta in zip(result["ids"], result["documents"], result["metadatas"]):
                chunks.append(
                    {
                        "chunk_id": cid,
                        "text": doc,
                        "doc_id": meta.get("doc_id", doc_id),
                        "filename": meta.get("filename", ""),
                        "page": meta.get("page", None),
                        "chunk_index": meta.get("chunk_index", 0),
                    }
                )
            return chunks
        except Exception as exc:
            logger.error("get_document_chunks failed for %s: %s", doc_id, exc)
            return []

    def get_collection_stats(self) -> Dict[str, Any]:
        """Return summary statistics about the collection."""
        try:
            total_chunks = self.collection.count()
            total_docs = len(self._bm25_corpus)
            return {
                "total_chunks": total_chunks,
                "total_documents": total_docs,
            }
        except Exception as exc:
            logger.warning("Could not fetch collection stats: %s", exc)
            return {"total_chunks": 0, "total_documents": 0}
