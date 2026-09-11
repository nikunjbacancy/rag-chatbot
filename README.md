# SageBot — RAG Chatbot

A production-quality Retrieval-Augmented Generation (RAG) chatbot that lets you upload documents and have an intelligent conversation about their contents. Built with FastAPI, Next.js, ChromaDB, and Google Gemini.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          Browser (Next.js)                       │
│                                                                   │
│  ┌──────────────────┐          ┌──────────────────────────────┐  │
│  │  DocumentManager │          │       ChatInterface           │  │
│  │  ─ FileUpload    │          │  ─ SSE streaming              │  │
│  │  ─ Retrieval     │          │  ─ Source citations           │  │
│  │    settings      │          │                               │  │
│  │  ─ System status │          │                               │  │
│  └────────┬─────────┘          └──────────────┬───────────────┘  │
└───────────┼────────────────────────────────────┼─────────────────┘
            │  /api/documents/*                  │  /api/chat/*
            │  (Next.js rewrites → :8000)        │
┌───────────▼────────────────────────────────────▼─────────────────┐
│                        FastAPI Backend (:8000)                     │
│                                                                    │
│  ┌─────────────────┐   ┌──────────────────┐   ┌───────────────┐  │
│  │ DocumentProcessor│   │ EmbeddingService  │   │RetrievalService│ │
│  │ ─ PDF/DOCX/TXT  │──▶│ SentenceTransform │──▶│ ChromaDB (vec)│  │
│  │ ─ CSV/Markdown  │   │ all-MiniLM-L6-v2  │   │ BM25 (sparse) │  │
│  │ ─ Smart chunking│   └──────────────────┘   │ RRF fusion    │  │
│  └─────────────────┘                           └───────┬───────┘  │
│                                                         │          │
│  ┌──────────────────────────────────────────────────────▼──────┐  │
│  │               GenerationService (Google Gemini SDK)          │  │
│  │               gemini-1.5-flash — streaming SSE               │  │
│  └──────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
            │                              │
   ┌────────▼──────┐            ┌──────────▼──────┐
   │  ChromaDB      │            │  In-memory store│
   │  (./chroma_db) │            │  conversations  │
   │  Persistent    │            │                 │
   └────────────────┘            └─────────────────┘
```

---

## Features

- **Multi-format document ingestion**: PDF, DOCX, TXT, Markdown, CSV
- **Smart chunking**: Sentence-boundary-aware text splitting with token-counted overlap (tiktoken)
- **Hybrid retrieval**: Dense vector search (ChromaDB cosine) + BM25 keyword search merged via Reciprocal Rank Fusion
- **Streaming responses**: Real-time token streaming via Server-Sent Events
- **Source citations**: Every response shows which document chunks were used, with page numbers and relevance scores
- **Conversation history**: Multi-turn chat with context carried across turns
- **Background processing**: Documents are processed asynchronously; UI polls and shows live status
- **Light UI**: Clean, responsive light-mode interface built with Tailwind CSS
- **Configurable retrieval**: Adjust the number of context chunks (Top K) directly from the sidebar

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM | Google Gemini (`gemini-1.5-flash`) |
| Embeddings | `all-MiniLM-L6-v2` (SentenceTransformers) |
| Vector store | ChromaDB (persistent, cosine similarity) |
| Sparse search | BM25 (rank-bm25) |
| Fusion | Reciprocal Rank Fusion (k=60) |
| Backend framework | FastAPI + Uvicorn |
| PDF parsing | pdfplumber |
| DOCX parsing | python-docx |
| CSV parsing | pandas |
| Token counting | tiktoken (cl100k_base) |
| Frontend framework | Next.js 14 (App Router) |
| UI | React 18 + Tailwind CSS |
| Markdown rendering | react-markdown + remark-gfm |
| File drag & drop | react-dropzone |
| Icons | lucide-react |

---

## Prerequisites

- **Python** 3.10 or 3.11
- **Node.js** 18 or 20
- **Google Gemini API key** — get one at https://aistudio.google.com/app/apikey

---

## Setup Instructions

### 1. Clone / enter the project directory

```bash
cd /path/to/rag-chatbot
```

### 2. Backend setup

```bash
cd backend

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Create your env file
cp .env.example .env
```

Open `.env` and fill in your Gemini API key:

```
GEMINI_API_KEY=your-key-here
```

The other defaults work out of the box but can be tuned:

| Variable | Default | Description |
|---|---|---|
| `GEMINI_MODEL` | `gemini-1.5-flash` | Gemini model ID |
| `EMBEDDING_MODEL` | `all-MiniLM-L6-v2` | SentenceTransformer model |
| `CHUNK_SIZE` | `512` | Max tokens per chunk |
| `CHUNK_OVERLAP` | `50` | Token overlap between chunks |
| `TOP_K_RESULTS` | `5` | Default chunks retrieved per question |
| `MAX_FILE_SIZE_MB` | `50` | Max upload size |

### 3. Frontend setup

```bash
cd ../frontend
npm install
```

### 4. Run the backend

```bash
cd backend
source .venv/bin/activate
python run.py
```

The API will be available at http://localhost:8000. Interactive docs at http://localhost:8000/docs.

### 5. Run the frontend

Open a second terminal:

```bash
cd frontend
npm run dev
```

### 6. Open the app

Navigate to **http://localhost:3000** in your browser.

---

## Usage Guide

1. **Upload a document**: Use the left panel to drag and drop (or click to browse) a PDF, Word, text, Markdown, or CSV file. The status badge will show "Indexing" while the backend parses and indexes it.

2. **Wait for indexing**: Once the badge turns green ("Ready"), the document is fully indexed and searchable.

3. **Ask questions**: Type your question in the chat box and press Enter (or click Send). The assistant will:
   - Embed your query
   - Run hybrid retrieval (vector + BM25) across all indexed documents
   - Stream Gemini's answer token by token
   - Show source citations at the bottom of the response

4. **Explore sources**: Click "N sources used" below any assistant response to expand the citation cards, which show the document name, page number, excerpt, and relevance score.

5. **Continue the conversation**: Follow-up questions maintain context from previous turns.

6. **Adjust retrieval depth**: Use the **Context chunks** slider in the left panel to control how many document passages are retrieved per question (1 = precise, 15 = broad).

7. **Clear conversation**: Click **Clear Conversation** in the left panel's Chat Controls section to start a fresh session. You'll be asked to confirm before anything is deleted.

8. **Delete a document**: Hover over a document card in the panel and click the trash icon. This removes both the file and all its indexed chunks.

---

## API Reference

The backend exposes a fully documented REST API. With the backend running, visit:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

Key endpoints:

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check + collection stats |
| `POST` | `/api/documents/upload` | Upload a document (multipart) |
| `GET` | `/api/documents/` | List all documents |
| `GET` | `/api/documents/{id}` | Get document details |
| `DELETE` | `/api/documents/{id}` | Delete document + chunks |
| `POST` | `/api/chat/stream` | Streaming chat (SSE) |
| `POST` | `/api/chat/` | Non-streaming chat |
| `GET` | `/api/chat/conversations/{id}` | Get conversation history |
| `DELETE` | `/api/chat/conversations/{id}` | Clear conversation |

---

## Project Structure

```
rag-chatbot/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app, service singletons, CORS
│   │   ├── core/config.py       # Pydantic settings from .env
│   │   ├── models/schemas.py    # Pydantic request/response models
│   │   ├── services/
│   │   │   ├── document_processor.py  # Parse + chunk documents
│   │   │   ├── embeddings.py          # SentenceTransformer wrapper
│   │   │   ├── retrieval.py           # ChromaDB + BM25 + RRF
│   │   │   └── generation.py          # Google Gemini streaming
│   │   └── api/
│   │       ├── documents.py     # Upload/list/delete endpoints
│   │       └── chat.py          # Stream/sync chat endpoints
│   ├── uploads/                 # Uploaded files (gitignored)
│   ├── chroma_db/               # ChromaDB persistence (gitignored)
│   ├── requirements.txt
│   ├── .env.example
│   └── run.py                   # uvicorn entrypoint
└── frontend/
    ├── app/
    │   ├── layout.tsx           # Root layout, Inter font
    │   ├── page.tsx             # Two-panel layout, shared state
    │   └── globals.css          # Tailwind + custom animations
    ├── components/
    │   ├── ChatInterface.tsx    # Main chat, SSE streaming logic
    │   ├── DocumentManager.tsx  # Full sidebar: docs, retrieval settings,
    │   │                        # chat controls, system status
    │   ├── FileUpload.tsx       # Drag & drop uploader
    │   ├── MessageBubble.tsx    # User/assistant message rendering
    │   └── SourceCitations.tsx  # Collapsible source cards
    ├── lib/api.ts               # Typed API client + SSE parser
    ├── package.json
    ├── tailwind.config.ts
    └── next.config.js           # API proxy rewrites
```

---

## How Hybrid Search Works

1. **Chunking**: Documents are split at sentence boundaries with a token-counted sliding window (512 tokens, 50-token overlap).

2. **Indexing**: Each chunk is embedded with `all-MiniLM-L6-v2` and stored in ChromaDB (cosine space). A BM25 index is simultaneously built from tokenised chunk text.

3. **Query time**:
   - The query is embedded and used to retrieve top-K candidates from ChromaDB (dense/semantic).
   - The query is tokenised and scored against the BM25 index (sparse/keyword).
   - Both ranked lists are merged using **Reciprocal Rank Fusion**: `score(d) = Σ 1/(k + rank(d))` where k=60.
   - The top-K fused results are passed to Gemini as numbered context documents.

4. **Generation**: Gemini receives a system prompt with the numbered source documents and instructions to cite them as [Source N], plus the conversation history for multi-turn context.

---

## Troubleshooting

**Backend won't start**: Make sure `.env` exists with a valid `GEMINI_API_KEY`.

**"Model not loaded" error**: The SentenceTransformer model downloads on first run (~90 MB). Wait for it to finish.

**Empty responses**: Ensure at least one document has status "Ready" before chatting.

**CORS errors**: Make sure the backend is running on port 8000 and the frontend on port 3000.

**Large PDFs are slow**: Increase `CHUNK_SIZE` to reduce chunk count, or use a machine with more RAM.
