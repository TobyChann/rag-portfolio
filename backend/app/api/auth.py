from fastapi import HTTPException, Request

from app.cache.redis_client import get_redis

ADMIN_COOKIE = "admin_session"


async def is_admin(request: Request) -> bool:
    token = request.cookies.get(ADMIN_COOKIE)
    if not token:
        return False
    return bool(await (await get_redis()).get(f"admin_session:{token}"))


async def require_admin(request: Request):
    if not request.cookies.get(ADMIN_COOKIE):
        raise HTTPException(status_code=401, detail="Not authenticated")
    if not await is_admin(request):
        raise HTTPException(status_code=401, detail="Session expired")
    return request.cookies[ADMIN_COOKIE]
