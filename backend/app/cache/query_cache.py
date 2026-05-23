import hashlib
import json
from app.cache.redis_client import get_redis

CACHE_TTL = 60 * 60 * 24  # 24 hours


def _hash_question(question: str) -> str:
    return hashlib.sha256(question.strip().lower().encode()).hexdigest()


async def get_cached_answer(question: str) -> dict | None:
    r = await get_redis()
    key = f"qa:{_hash_question(question)}"
    value = await r.get(key)
    if value:
        return json.loads(value)
    return None


async def set_cached_answer(question: str, answer: str, chunks: list):
    r = await get_redis()
    key = f"qa:{_hash_question(question)}"
    payload = json.dumps({"answer": answer, "chunks": chunks})
    await r.setex(key, CACHE_TTL, payload)


async def set_session(session_id: str, data: dict, ttl: int = 86400):
    r = await get_redis()
    await r.setex(f"session:{session_id}", ttl, json.dumps(data))


async def get_session(session_id: str) -> dict | None:
    r = await get_redis()
    value = await r.get(f"session:{session_id}")
    return json.loads(value) if value else None
