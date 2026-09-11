import re
import logging
from pathlib import Path
from typing import List, Dict, Any

import tiktoken
import pdfplumber
import pandas as pd
from docx import Document

logger = logging.getLogger(__name__)

# Use cl100k_base tokenizer (same as GPT-4 / text-embedding-ada-002)
try:
    _tokenizer = tiktoken.get_encoding("cl100k_base")
except Exception:
    _tokenizer = None


def _count_tokens(text: str) -> int:
    if _tokenizer:
        return len(_tokenizer.encode(text))
    # Fallback: rough approximation
    return len(text.split())


def _tokenize(text: str) -> List[str]:
    if _tokenizer:
        tokens = _tokenizer.encode(text)
        return [_tokenizer.decode([t]) for t in tokens]
    return text.split()


def _decode_tokens(tokens: List[str]) -> str:
    return "".join(tokens)


class DocumentProcessor:
    """Parses various document formats and splits them into overlapping chunks."""

    # ------------------------------------------------------------------ #
    # Parsers                                                              #
    # ------------------------------------------------------------------ #

    def parse_pdf(self, file_path: Path) -> List[Dict[str, Any]]:
        """Extract text per page from a PDF using pdfplumber."""
        pages: List[Dict[str, Any]] = []
        try:
            with pdfplumber.open(file_path) as pdf:
                for page_num, page in enumerate(pdf.pages, start=1):
                    text = page.extract_text() or ""
                    text = text.strip()
                    if text:
                        pages.append({"page": page_num, "text": text})
        except Exception as exc:
            logger.error("PDF parsing error for %s: %s", file_path, exc)
            raise
        return pages

    def parse_docx(self, file_path: Path) -> List[Dict[str, Any]]:
        """Extract paragraphs from a DOCX file with estimated page numbers."""
        pages: List[Dict[str, Any]] = []
        try:
            doc = Document(str(file_path))
            paragraphs_per_page = 15  # rough estimate
            current_page = 1
            buffer: List[str] = []

            for i, para in enumerate(doc.paragraphs):
                text = para.text.strip()
                if text:
                    buffer.append(text)

                # Group paragraphs into estimated pages
                if len(buffer) >= paragraphs_per_page:
                    pages.append({"page": current_page, "text": "\n".join(buffer)})
                    buffer = []
                    current_page += 1

            if buffer:
                pages.append({"page": current_page, "text": "\n".join(buffer)})

            # If nothing was extracted yet (empty paragraphs), try tables
            if not pages:
                table_texts: List[str] = []
                for table in doc.tables:
                    for row in table.rows:
                        row_text = " | ".join(
                            cell.text.strip() for cell in row.cells if cell.text.strip()
                        )
                        if row_text:
                            table_texts.append(row_text)
                if table_texts:
                    pages.append({"page": 1, "text": "\n".join(table_texts)})

        except Exception as exc:
            logger.error("DOCX parsing error for %s: %s", file_path, exc)
            raise
        return pages

    def parse_txt(self, file_path: Path) -> List[Dict[str, Any]]:
        """Read a plain-text file and treat it as a single page."""
        try:
            text = file_path.read_text(encoding="utf-8", errors="replace").strip()
            if not text:
                return []
            return [{"page": 1, "text": text}]
        except Exception as exc:
            logger.error("TXT parsing error for %s: %s", file_path, exc)
            raise

    def parse_csv(self, file_path: Path) -> List[Dict[str, Any]]:
        """Convert CSV rows to human-readable text."""
        pages: List[Dict[str, Any]] = []
        try:
            df = pd.read_csv(file_path)
            rows_per_page = 50
            page_num = 1

            for start in range(0, len(df), rows_per_page):
                chunk_df = df.iloc[start : start + rows_per_page]
                lines: List[str] = []
                for _, row in chunk_df.iterrows():
                    parts = [
                        f"{col}: {val}"
                        for col, val in row.items()
                        if pd.notna(val) and str(val).strip()
                    ]
                    lines.append(" | ".join(parts))
                text = "\n".join(lines).strip()
                if text:
                    pages.append({"page": page_num, "text": text})
                page_num += 1

        except Exception as exc:
            logger.error("CSV parsing error for %s: %s", file_path, exc)
            raise
        return pages

    def parse_md(self, file_path: Path) -> List[Dict[str, Any]]:
        """Read a Markdown file, strip markup, and return clean text as one page."""
        try:
            raw = file_path.read_text(encoding="utf-8", errors="replace")
            # Strip fenced code blocks
            text = re.sub(r"```[\s\S]*?```", "", raw)
            text = re.sub(r"`[^`]+`", "", text)
            # Strip HTML tags
            text = re.sub(r"<[^>]+>", "", text)
            # Strip headings markers, bold/italic, links, images
            text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
            text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
            text = re.sub(r"#{1,6}\s*", "", text)
            text = re.sub(r"[*_]{1,3}([^*_]+)[*_]{1,3}", r"\1", text)
            text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
            text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
            # Collapse multiple blank lines
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            if not text:
                return []
            return [{"page": 1, "text": text}]
        except Exception as exc:
            logger.error("Markdown parsing error for %s: %s", file_path, exc)
            raise

    # ------------------------------------------------------------------ #
    # Chunking                                                             #
    # ------------------------------------------------------------------ #

    def chunk_text(
        self,
        pages: List[Dict[str, Any]],
        chunk_size: int = 512,
        overlap: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Split pages into overlapping chunks that respect sentence boundaries.

        Strategy:
        1. Tokenize each page's text.
        2. Walk through tokens greedily, splitting at the nearest sentence
           boundary (., !, ?) that keeps the chunk within `chunk_size` tokens.
        3. Each new chunk starts with the last `overlap` tokens of the
           previous chunk.
        """
        sentence_end_re = re.compile(r"(?<=[.!?])\s+")
        chunks: List[Dict[str, Any]] = []
        chunk_index = 0

        for page_info in pages:
            page_num: int = page_info["page"]
            text: str = page_info["text"]

            # Split page into sentences first so we can respect boundaries
            sentences = sentence_end_re.split(text)
            # Re-attach trailing whitespace that was consumed
            sentences = [s.strip() for s in sentences if s.strip()]

            current_tokens: List[str] = []

            def flush_chunk(tokens: List[str]) -> None:
                nonlocal chunk_index
                chunk_text_str = _decode_tokens(tokens).strip()
                if chunk_text_str:
                    chunks.append(
                        {
                            "text": chunk_text_str,
                            "page": page_num,
                            "chunk_index": chunk_index,
                        }
                    )
                    chunk_index += 1

            for sentence in sentences:
                sentence_tokens = _tokenize(sentence)

                # If a single sentence is already longer than chunk_size,
                # hard-split it.
                if len(sentence_tokens) > chunk_size:
                    # Flush whatever we have first
                    if current_tokens:
                        flush_chunk(current_tokens)
                        current_tokens = current_tokens[-overlap:] if overlap else []

                    # Hard-split the long sentence
                    for i in range(0, len(sentence_tokens), chunk_size - overlap):
                        segment = sentence_tokens[i : i + chunk_size]
                        flush_chunk(segment)
                    # Carry overlap from last segment
                    last_segment = sentence_tokens[-(overlap):] if overlap else []
                    current_tokens = last_segment
                    continue

                # Would adding this sentence exceed the limit?
                if len(current_tokens) + len(sentence_tokens) > chunk_size:
                    # Flush current chunk
                    flush_chunk(current_tokens)
                    # Start new chunk with overlap from end of old chunk
                    overlap_tokens = current_tokens[-overlap:] if overlap else []
                    current_tokens = overlap_tokens + sentence_tokens
                else:
                    if current_tokens:
                        # Add a space separator (as a token)
                        current_tokens += _tokenize(" ")
                    current_tokens += sentence_tokens

            # Flush any remaining tokens
            if current_tokens:
                flush_chunk(current_tokens)

        return chunks

    # ------------------------------------------------------------------ #
    # High-level entrypoint                                                #
    # ------------------------------------------------------------------ #

    async def process_document(
        self,
        file_path: Path,
        doc_id: str,
        filename: str,
        chunk_size: int = 512,
        chunk_overlap: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        Detect file type, parse and chunk the document.

        Returns a list of chunk dicts:
            {"text": str, "page": int, "chunk_index": int, "doc_id": str, "filename": str}
        """
        suffix = file_path.suffix.lower().lstrip(".")
        parser_map = {
            "pdf": self.parse_pdf,
            "docx": self.parse_docx,
            "txt": self.parse_txt,
            "csv": self.parse_csv,
            "md": self.parse_md,
        }

        parser = parser_map.get(suffix)
        if parser is None:
            raise ValueError(f"Unsupported file type: {suffix}")

        pages = parser(file_path)
        if not pages:
            raise ValueError(f"No text could be extracted from {filename}")

        raw_chunks = self.chunk_text(pages, chunk_size=chunk_size, overlap=chunk_overlap)

        # Enrich each chunk with document metadata
        for chunk in raw_chunks:
            chunk["doc_id"] = doc_id
            chunk["filename"] = filename

        return raw_chunks
