# backend/app/client_ip.py
import hmac

from fastapi import Request

from app.config import get_settings


def client_ip(request: Request) -> str:
    """The visitor's IP. Requests forwarded by the Vercel frontend arrive from
    Vercel's servers, so the frontend middleware passes the visitor's IP in
    X-Client-IP together with a shared secret. The header is only believed when
    the secret matches — otherwise anyone calling the backend directly could
    pick their own IP and slip past the rate limit."""
    secret = get_settings().proxy_secret
    if secret and hmac.compare_digest(request.headers.get("x-proxy-secret", ""), secret):
        forwarded = request.headers.get("x-client-ip", "").strip()
        if forwarded:
            return forwarded
    return request.client.host if request.client else ""
