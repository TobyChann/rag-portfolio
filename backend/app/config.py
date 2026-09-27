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

    # App
    environment: str = "development"
    rate_limit_per_hour: int = 20
    session_ttl_seconds: int = 86400

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()