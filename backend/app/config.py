# backend/app/config.py
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # OpenAI — funded key, used for the visitor-facing RAG answer (reliable, no
    # free-tier 503s). Ingestion stays on Gemini's free tier.
    openai_api_key: str = ""
    openai_rag_model: str = "gpt-4o-mini"

    # Which provider answers visitor queries: "openai" or "gemini".
    # Falls back to Gemini automatically if openai_api_key is empty.
    rag_provider: str = "openai"

    # Gemini (ingestion: parsing, image OCR, tagging; owner planning chat)
    gemini_api_key: str = ""
    tag_model: str = "gemini-3.1-flash-lite"
    parse_model: str = "gemini-3.5-flash"
    rag_model: str = "gemini-3.5-flash"
    planning_model: str = "gemini-2.5-flash"

    # Zilliz
    zilliz_uri: str
    zilliz_token: str
    zilliz_collection: str = "portfolio_chunks"

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Google
    google_service_account_path: str = "./service-account.json"
    google_drive_folder_id: str

    # LangSmith
    langsmith_api_key: str = ""
    langsmith_tracing: str = "false"
    langsmith_project: str = "portfolio-rag"

    # Huggingface
    hf_token: str = ""

    # Admin
    admin_password_hash: str = ""

    # Sync
    # Minutes between automatic delta syncs on a long-lived backend (0 = off).
    auto_sync_interval_minutes: int = 0
    # Shared secret for POST /api/admin/sync/cron (Vercel Cron, GitHub Actions…).
    cron_secret: str = ""
    # Sync also ingests brand-new Notes_* docs. The Notes_ prefix is the opt-in;
    # anything else still goes through the admin picker.
    sync_ingest_new_notes: bool = True

    # App
    environment: str = "development"
    # Comma-separated origins allowed outside development (your Vercel URL).
    cors_origins: str = ""
    # Shared with the Vercel frontend's middleware, which forwards the
    # visitor's IP; see app/client_ip.py. Empty = never trust forwarded IPs.
    proxy_secret: str = ""
    rate_limit_per_hour: int = 20
    session_ttl_seconds: int = 86400

    # On-demand ISR: the frontend's /revalidate route and its shared secret.
    # Empty = pages just refresh on their own revalidate window.
    frontend_revalidate_url: str = ""
    revalidate_secret: str = ""

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()