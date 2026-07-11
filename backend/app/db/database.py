from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
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
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise