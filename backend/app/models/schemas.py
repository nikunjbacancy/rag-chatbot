from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class DocumentStatus(str, Enum):
    processing = "processing"
    ready = "ready"
    failed = "failed"


class DocumentResponse(BaseModel):
    id: str
    filename: str
    file_type: str
    status: DocumentStatus
    chunk_count: int = 0
    created_at: datetime
    size_bytes: int
    error_message: Optional[str] = None


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]
    total: int


class Source(BaseModel):
    document_id: str
    document_name: str
    chunk_text: str  # first 200 chars
    page_number: Optional[int] = None
    relevance_score: float


class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str
    sources: Optional[List[Source]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    top_k: Optional[int] = 5


class ChatResponse(BaseModel):
    message: ChatMessage
    conversation_id: str


class DeleteResponse(BaseModel):
    success: bool
    message: str
