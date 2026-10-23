"""The homepage is statically regenerated (ISR) on Vercel. After anything a
visitor can see changes, drop the cached public stats and skill evidence and
ask the frontend to rebuild now instead of waiting out its revalidate window."""
import httpx

from app.cache.redis_client import get_redis
from app.config import get_settings

PUBLIC_STATS_KEY = "stats:public"
SKILLS_EVIDENCE_KEY = "skills:evidence"


async def refresh_public_pages():
    try:
        await (await get_redis()).delete(PUBLIC_STATS_KEY, SKILLS_EVIDENCE_KEY)
    except Exception as e:
        print(f"[revalidate] couldn't clear public caches: {e}")

    s = get_settings()
    if not s.frontend_revalidate_url or not s.revalidate_secret:
        return
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.post(s.frontend_revalidate_url,
                                    headers={"x-revalidate-secret": s.revalidate_secret})
            res.raise_for_status()
    except Exception as e:
        print(f"[revalidate] frontend revalidation failed (pages refresh within 5 min anyway): {e}")
