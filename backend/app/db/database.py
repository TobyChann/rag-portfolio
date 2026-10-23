from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

db_url = settings.database_url.replace("://", "+asyncpg://", 1)

# Handle Supabase SSL requirement
ssl_required = "ssl=require" in db_url
db_url = db_url.replace("?ssl=require", "").replace("&ssl=require", "")

engine = create_async_engine(
    db_url,
    echo=settings.environment == "development",
    connect_args={
        "ssl": "require",
        "statement_cache_size": 0,  # required for Supabase session pooler
    } if ssl_required else {"statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def init_db():
    # Migrations first: they rename legacy tables that create_all would
    # otherwise shadow with fresh empty ones.
    from app.db.migrations import run_migrations
    async with engine.begin() as conn:
        # pgvector ships in the image but each database opts in; the chunks
        # table needs it before create_all.
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        applied = await run_migrations(conn)
        if applied:
            print(f"[startup] Applied migrations: {', '.join(applied)}")
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise