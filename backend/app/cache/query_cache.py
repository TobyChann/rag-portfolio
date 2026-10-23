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


async def clear_answer_cache() -> int:
    """Drop every cached answer — call when the knowledge base changes in a way
    that makes old answers stale (e.g. a new resume)."""
    r = await get_redis()
    keys = [k async for k in r.scan_iter("qa:*")]
    if keys:
        await r.delete(*keys)
    return len(keys)


# Recent turns per chat session, so follow-ups can be condensed. Answers are
# clipped: Redis is LRU-capped and this only needs to resolve "that" / "it".
CONVERSATION_TURNS = 6
ANSWER_CLIP = 600


async def get_conversation(session_id: str) -> list[dict]:
    r = await get_redis()
    return [json.loads(t) for t in await r.lrange(f"conv:{session_id}", 0, -1)]


async def append_turn(session_id: str, question: str, answer: str, ttl: int = 86400):
    r = await get_redis()
    key = f"conv:{session_id}"
    await r.rpush(key, json.dumps({"q": question, "a": answer[:ANSWER_CLIP]}))
    await r.ltrim(key, -CONVERSATION_TURNS, -1)
    await r.expire(key, ttl)


async def clear_conversation(session_id: str):
    await (await get_redis()).delete(f"conv:{session_id}")


async def set_session(session_id: str, data: dict, ttl: int = 86400):
    r = await get_redis()
    await r.setex(f"session:{session_id}", ttl, json.dumps(data))


async def get_session(session_id: str) -> dict | None:
    r = await get_redis()
    value = await r.get(f"session:{session_id}")
    return json.loads(value) if value else None
