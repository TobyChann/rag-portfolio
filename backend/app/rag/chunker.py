# backend/app/rag/chunker.py
import re
from dataclasses import dataclass

CHUNK_SIZE = 800        # target tokens per chunk (rough char estimate: * 4)
CHUNK_OVERLAP = 150     # overlap between chunks to preserve context


@dataclass
class Chunk:
    text: str
    doc_id: str
    doc_title: str
    chunk_index: int
    heading: str = ""   # nearest heading above this chunk


def chunk_document(text: str, doc_id: str, doc_title: str) -> list[Chunk]:
    """
    Semantic chunking strategy:
    1. Split on headings first (preserves topic boundaries)
    2. If a section is too long, split further with overlap
    3. Tag each chunk with its nearest heading
    """
    sections = _split_by_headings(text)
    chunks = []
    chunk_index = 0

    for heading, content in sections:
        # Clean up whitespace
        content = content.strip()
        if not content:
            continue

        # If section fits in one chunk, keep it whole
        if len(content) <= CHUNK_SIZE * 4:
            chunks.append(Chunk(
                text=f"{heading}\n\n{content}" if heading else content,
                doc_id=doc_id,
                doc_title=doc_title,
                chunk_index=chunk_index,
                heading=heading,
            ))
            chunk_index += 1
        else:
            # Split large sections with overlap
            sub_chunks = _split_with_overlap(content, CHUNK_SIZE * 4, CHUNK_OVERLAP * 4)
            for sub in sub_chunks:
                chunks.append(Chunk(
                    text=f"{heading}\n\n{sub}" if heading else sub,
                    doc_id=doc_id,
                    doc_title=doc_title,
                    chunk_index=chunk_index,
                    heading=heading,
                ))
                chunk_index += 1

    return chunks


def _split_by_headings(text: str) -> list[tuple[str, str]]:
    """Split markdown text at heading boundaries. Returns [(heading, content)]."""
    pattern = r"(^#{1,3} .+$)"
    parts = re.split(pattern, text, flags=re.MULTILINE)

    sections = []
    current_heading = ""
    current_content = []

    for part in parts:
        if re.match(r"^#{1,3} ", part):
            if current_content:
                sections.append((current_heading, "\n".join(current_content).strip()))
                current_content = []
            current_heading = part.strip()
        else:
            current_content.append(part)

    if current_content:
        sections.append((current_heading, "\n".join(current_content).strip()))

    return sections if sections else [("", text)]


def _split_with_overlap(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Split text into overlapping chunks by character count."""
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end]
        # Try to break at sentence boundary
        if end < len(text):
            last_period = chunk.rfind(". ")
            if last_period > chunk_size // 2:
                chunk = chunk[:last_period + 1]
        chunks.append(chunk.strip())
        start += len(chunk) - overlap
    return chunks
