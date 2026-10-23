from fastapi import HTTPException, Request
from app.cache.redis_client import get_redis
from app.config import get_settings
from app.client_ip import client_ip

settings = get_settings()


async def hit_rate_limit(request: Request, bucket: str, limit: int, what: str):
    """Count one request against an hourly per-IP bucket; 429 past `limit`."""
    r = await get_redis()
    key = f"rate:{bucket}{client_ip(request)}"
    count = await r.incr(key)
    if count == 1:
        await r.expire(key, 3600)
    if count > limit:
        raise HTTPException(status_code=429, detail=f"Rate limit exceeded. Max {limit} {what}/hour.")


async def check_rate_limit(request: Request):
    """Chat questions. Use as a FastAPI dependency."""
    await hit_rate_limit(request, "", settings.rate_limit_per_hour, "queries")
