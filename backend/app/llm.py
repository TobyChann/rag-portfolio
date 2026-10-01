# backend/app/llm.py
"""Shared LLM plumbing: the Gemini client and transient-error classification."""
import re

import openai

from app.config import get_settings

# Gemini's OpenAI-compatible endpoint — lets the official openai SDK talk to Gemini.
GEMINI_OPENAI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai/"


def gemini_client() -> openai.AsyncOpenAI:
    return openai.AsyncOpenAI(api_key=get_settings().gemini_api_key, base_url=GEMINI_OPENAI_BASE)


# HTTP statuses that mean "try again shortly": rate limit, and 5xx overload /
# gateway blips (Gemini's free tier throws 503 "high demand" under load).
_TRANSIENT_STATUSES = {429, 500, 502, 503, 504}

# Last-resort text match for errors that arrive wrapped or without a status code.
# Whole-word / exact tokens only — a bare "rate" substring used to match words
# like "generate" and misclassify real bugs as overload.
_TRANSIENT_TEXT = re.compile(
    r"\b(429|503)\b|resource_exhausted|\bunavailable\b|\boverloaded\b|high demand|rate limit",
    re.IGNORECASE,
)


def is_transient_llm_error(e: Exception) -> bool:
    """True for errors worth a retry (rate limit, overload, network blip).
    Works for the openai SDK (OpenAI + Gemini's compat endpoint) and the
    google-genai SDK, whose APIError carries an int `.code`."""
    # Out of credits is a 429 too, but retrying won't fix it.
    if getattr(e, "code", None) == "insufficient_quota":
        return False
    if isinstance(e, openai.APIConnectionError):   # includes APITimeoutError
        return True
    status = getattr(e, "status_code", None)
    if status is None and isinstance(getattr(e, "code", None), int):
        status = e.code                            # google.genai.errors.APIError
    if status is not None:
        return status in _TRANSIENT_STATUSES
    return bool(_TRANSIENT_TEXT.search(str(e)))
