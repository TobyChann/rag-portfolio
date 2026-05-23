from fastapi import APIRouter, Request, BackgroundTasks, Header
from app.sync.ingestion import ingest_document
from app.sync.google_client import get_doc_metadata

router = APIRouter()


@router.post("/webhook/drive")
async def drive_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_goog_resource_id: str = Header(None),   # Google sends the changed file's ID
    x_goog_channel_id: str = Header(None),
    x_goog_resource_state: str = Header(None),
):
    """
    Google Drive push notification endpoint.
    Google POSTs here when a watched file changes.
    We re-ingest in the background so the response is instant.
    """
    # Google sends a "sync" state on channel creation — ignore it
    if x_goog_resource_state == "sync":
        return {"ok": True}

    # x_goog_resource_id is the Drive file ID of the changed document
    if x_goog_resource_id:
        background_tasks.add_task(
            _reingest,
            google_doc_id=x_goog_resource_id,
        )

    return {"ok": True}


async def _reingest(google_doc_id: str):
    try:
        meta = get_doc_metadata(google_doc_id)
        result = await ingest_document(google_doc_id, meta["name"])
        print(f"[webhook] Re-ingested: {result}")
    except Exception as e:
        print(f"[webhook] Error re-ingesting {google_doc_id}: {e}")


@router.post("/ingest/all")
async def ingest_all(background_tasks: BackgroundTasks):
    """
    Manually trigger full re-ingestion of all docs.
    Call this once on first setup, then webhooks handle updates.
    Test via Swagger at /docs
    """
    from app.sync.ingestion import ingest_all_documents
    background_tasks.add_task(ingest_all_documents)
    return {"message": "Ingestion started in background. Check server logs for progress."}


@router.post("/ingest/doc/{doc_id}")
async def ingest_one(doc_id: str, background_tasks: BackgroundTasks):
    """Manually re-ingest a single document by its Google Doc ID."""
    background_tasks.add_task(ingest_document, doc_id)
    return {"message": f"Ingestion started for {doc_id}"}
