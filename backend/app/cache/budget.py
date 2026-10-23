# backend/app/cache/budget.py
"""Daily OpenAI spend guard. Every OpenAI completion adds its estimated cost
(from the response's token usage) to a per-day Redis counter; past
daily_openai_budget_usd the visitor-facing calls switch to Gemini's free tier
and the JD matcher pauses until tomorrow (UTC)."""
from datetime import datetime, timezone

from app.cache.redis_client import get_redis
from app.config import get_settings

settings = get_settings()


def _key() -> str:
    return f"spend:{datetime.now(timezone.utc).date().isoformat()}"


async def add_spend(usage) -> None:
    if not usage:
        return
    cost = ((getattr(usage, "prompt_tokens", 0) or 0) * settings.openai_price_in_per_m
            + (getattr(usage, "completion_tokens", 0) or 0) * settings.openai_price_out_per_m) / 1_000_000
    r = await get_redis()
    await r.incrbyfloat(_key(), cost)
    await r.expire(_key(), 3 * 86400)


async def spend_today() -> float:
    return float(await (await get_redis()).get(_key()) or 0)


async def over_budget() -> bool:
    return await spend_today() >= settings.daily_openai_budget_usd
