from fastapi import HTTPException, Request
from app.cache.redis_client import get_redis
from app.config import get_settings

settings = get_settings()


async def check_rate_limit(request: Request):
    """Raise 429 if IP exceeds rate limit. Use as a FastAPI dependency."""
    r = await get_redis()
    ip = request.client.host
    key = f"rate:{ip}"

    count = await r.incr(key)
    if count == 1:
        # First request — set 1 hour TTL
        await r.expire(key, 3600)

    if count > settings.rate_limit_per_hour:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {settings.rate_limit_per_hour} queries/hour."
        )
