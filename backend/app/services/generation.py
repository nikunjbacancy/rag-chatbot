import logging
import warnings
from typing import AsyncGenerator, List, Dict, Any

from google import genai
from google.genai import types

from app.core.config import settings

# Suppress the AFC warning from google-genai SDK
warnings.filterwarnings("ignore", message=".*AFC.*", category=UserWarning)
logging.getLogger("google_genai.models").setLevel(logging.ERROR)

logger = logging.getLogger(__name__)


def _build_context_block(context_chunks: List[Dict[str, Any]]) -> str:
    if not context_chunks:
        return "No context documents available."
    lines: List[str] = []
    for i, chunk in enumerate(context_chunks, start=1):
        filename = chunk.get("filename", "Unknown document")
        page = chunk.get("page")
        text = chunk.get("text", "")
        header = f"[Source {i}] {filename}"
        if page:
            header += f" (page {page})"
        lines.append(f"{header}\n{text}")
    return "\n\n---\n\n".join(lines)


def _build_system_prompt(context_chunks: List[Dict[str, Any]]) -> str:
    context_block = _build_context_block(context_chunks)
    return f"""You are a knowledgeable assistant that answers questions based on the provided documents.

INSTRUCTIONS:
- Answer based ONLY on the provided context documents below.
- If the context doesn't contain enough information, say so clearly and honestly.
- Cite sources by referencing [Source 1], [Source 2] etc. naturally in your response.
- Be concise but thorough.
- If asked something not covered by the documents, acknowledge the limitation.
- Use markdown formatting where it improves readability.

CONTEXT DOCUMENTS:
{context_block}"""


class GenerationService:
    def __init__(self) -> None:
        self.client = genai.Client(api_key=settings.gemini_api_key)
        self.model_name = settings.gemini_model
        logger.info("GenerationService initialised with Gemini model: %s", self.model_name)

    def _build_contents(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
    ) -> List[types.Content]:
        """Build the contents list with history + current query."""
        contents: List[types.Content] = []

        # Add conversation history (last 10 turns)
        recent = conversation_history[-10:] if len(conversation_history) > 10 else conversation_history
        for turn in recent:
            role = turn.get("role", "user")
            content = turn.get("content", "")
            if not content:
                continue
            gemini_role = "model" if role == "assistant" else "user"
            contents.append(types.Content(role=gemini_role, parts=[types.Part(text=content)]))

        # Add current query with system context embedded
        system_prompt = _build_system_prompt(context_chunks)
        full_message = f"{system_prompt}\n\nUser question: {query}"
        contents.append(types.Content(role="user", parts=[types.Part(text=full_message)]))
        return contents

    async def generate_streaming(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
    ) -> AsyncGenerator[str, None]:
        contents = self._build_contents(query, context_chunks, conversation_history)
        try:
            # Await the coroutine to get the async iterator, then stream chunks
            stream = await self.client.aio.models.generate_content_stream(
                model=self.model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=2048,
                ),
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as exc:
            logger.error("Gemini streaming error: %s", exc)
            yield f"\n\n[Error: {str(exc)}]"

    def generate(
        self,
        query: str,
        context_chunks: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
    ) -> str:
        contents = self._build_contents(query, context_chunks, conversation_history)
        try:
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0.2,
                    max_output_tokens=2048,
                ),
            )
            return response.text or ""
        except Exception as exc:
            logger.error("Gemini generation error: %s", exc)
            raise
