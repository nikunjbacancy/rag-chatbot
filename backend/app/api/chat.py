import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.config import settings
from app.models.schemas import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    DeleteResponse,
    Source,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"], redirect_slashes=False)

# ------------------------------------------------------------------ #
# In-memory conversation store                                         #
# { conversation_id: [{"role": str, "content": str, "sources": [...], "timestamp": str}] }
# ------------------------------------------------------------------ #
_conversations: Dict[str, List[Dict[str, Any]]] = {}


def _get_or_create_conversation(conversation_id: str) -> List[Dict[str, Any]]:
    if conversation_id not in _conversations:
        _conversations[conversation_id] = []
    return _conversations[conversation_id]


def _chunks_to_sources(chunks: List[Dict[str, Any]]) -> List[Source]:
    """Convert retrieval result dicts to Source schema objects."""
    sources: List[Source] = []
    for chunk in chunks:
        text = chunk.get("text", "")
        sources.append(
            Source(
                document_id=chunk.get("doc_id", ""),
                document_name=chunk.get("filename", "Unknown"),
                chunk_text=text[:200],
                page_number=chunk.get("page"),
                relevance_score=round(float(chunk.get("score", 0.0)), 4),
            )
        )
    return sources


# ------------------------------------------------------------------ #
# SSE helpers                                                          #
# ------------------------------------------------------------------ #

def _sse_event(data: dict) -> str:
    """Format a single SSE event."""
    return f"data: {json.dumps(data)}\n\n"


async def _stream_response(
    request: ChatRequest,
    conversation_id: str,
) -> AsyncGenerator[str, None]:
    """Core streaming logic — yields SSE-formatted events."""
    from app.main import embedding_service, generation_service, retrieval_service  # lazy import

    history = _get_or_create_conversation(conversation_id)

    # 1. Retrieve relevant chunks (run sync embedding + search in thread pool)
    top_k = request.top_k or settings.top_k_results
    try:
        loop = asyncio.get_event_loop()
        query_embedding = await loop.run_in_executor(
            None, embedding_service.embed_query, request.message
        )
        chunks = await loop.run_in_executor(
            None,
            lambda: retrieval_service.hybrid_search(
                query=request.message,
                query_embedding=query_embedding,
                top_k=top_k,
            ),
        )
    except Exception as exc:
        logger.error("Retrieval failed: %s", exc)
        yield _sse_event({"type": "error", "content": "Retrieval failed. Please try again."})
        yield _sse_event({"type": "done"})
        return

    # 2. Stream generation
    full_response = ""
    try:
        async for token in generation_service.generate_streaming(
            query=request.message,
            context_chunks=chunks,
            conversation_history=history,
        ):
            full_response += token
            yield _sse_event({"type": "token", "content": token})
    except Exception as exc:
        logger.error("Generation streaming failed: %s", exc)
        yield _sse_event({"type": "error", "content": "Generation failed. Please try again."})
        yield _sse_event({"type": "done"})
        return

    # 3. Emit sources
    sources = _chunks_to_sources(chunks)
    sources_payload = [s.model_dump() for s in sources]
    yield _sse_event({"type": "sources", "sources": sources_payload})

    # 4. Persist conversation
    now = datetime.utcnow().isoformat()
    history.append({"role": "user", "content": request.message, "timestamp": now})
    history.append(
        {
            "role": "assistant",
            "content": full_response,
            "sources": sources_payload,
            "timestamp": now,
        }
    )

    yield _sse_event({"type": "done"})


# ------------------------------------------------------------------ #
# Endpoints                                                            #
# ------------------------------------------------------------------ #

@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """
    Streaming chat endpoint.

    Returns Server-Sent Events:
      data: {"type": "token",   "content": "..."}
      data: {"type": "sources", "sources": [...]}
      data: {"type": "done"}
    """
    conversation_id = request.conversation_id or str(uuid.uuid4())

    return StreamingResponse(
        _stream_response(request, conversation_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Conversation-Id": conversation_id,
            "Access-Control-Expose-Headers": "X-Conversation-Id",
        },
    )


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Non-streaming chat endpoint.

    Returns the complete assistant response in one shot.
    """
    from app.main import embedding_service, generation_service, retrieval_service  # lazy import

    conversation_id = request.conversation_id or str(uuid.uuid4())
    history = _get_or_create_conversation(conversation_id)

    # Retrieve
    top_k = request.top_k or settings.top_k_results
    try:
        query_embedding = embedding_service.embed_query(request.message)
        chunks = retrieval_service.hybrid_search(
            query=request.message,
            query_embedding=query_embedding,
            top_k=top_k,
        )
    except Exception as exc:
        logger.error("Retrieval failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Retrieval service error.",
        )

    # Generate
    try:
        response_text = generation_service.generate(
            query=request.message,
            context_chunks=chunks,
            conversation_history=history,
        )
    except Exception as exc:
        logger.error("Generation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Generation service error.",
        )

    sources = _chunks_to_sources(chunks)
    now = datetime.utcnow()

    # Persist
    history.append({"role": "user", "content": request.message, "timestamp": now.isoformat()})
    history.append(
        {
            "role": "assistant",
            "content": response_text,
            "sources": [s.model_dump() for s in sources],
            "timestamp": now.isoformat(),
        }
    )

    assistant_message = ChatMessage(
        role="assistant",
        content=response_text,
        sources=sources,
        timestamp=now,
    )
    return ChatResponse(message=assistant_message, conversation_id=conversation_id)


@router.get("/conversations/{conversation_id}")
async def get_conversation(conversation_id: str):
    """Return the full message history for a conversation."""
    if conversation_id not in _conversations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
    history = _conversations[conversation_id]
    return {"conversation_id": conversation_id, "messages": history, "total": len(history)}


@router.delete("/conversations/{conversation_id}", response_model=DeleteResponse)
async def delete_conversation(conversation_id: str):
    """Clear all messages in a conversation."""
    if conversation_id not in _conversations:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found.",
        )
    del _conversations[conversation_id]
    return DeleteResponse(success=True, message=f"Conversation {conversation_id} cleared.")
