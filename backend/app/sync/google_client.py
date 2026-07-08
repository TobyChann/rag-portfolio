# backend/app/sync/google_client.py
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config import get_settings

settings = get_settings()

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/documents.readonly",
]

NOTES_PREFIX = "Notes_"
GOOGLE_DOC_MIME = "application/vnd.google-apps.document"


def _get_credentials():
    return service_account.Credentials.from_service_account_file(
        settings.google_service_account_path,
        scopes=SCOPES,
    )


def get_drive_service():
    return build("drive", "v3", credentials=_get_credentials())


def get_docs_service():
    return build("docs", "v1", credentials=_get_credentials())


# ── Listing ──────────────────────────────────────────────

def _list_all_files(service, folder_id: str) -> list[dict]:
    """Recursively return every non-folder file: {id, name, mimeType, modifiedTime}."""
    files = []
    results = service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id, name, mimeType, modifiedTime)",
    ).execute()
    for item in results.get("files", []):
        if item["mimeType"] == "application/vnd.google-apps.folder":
            files.extend(_list_all_files(service, item["id"]))
        else:
            files.append(item)
    return files


def list_docs_in_folder(folder_id: str) -> list[dict]:
    """Ingestable Notes_ Google Docs only. Used by ingestion."""
    service = get_drive_service()
    return [
        f for f in _list_all_files(service, folder_id)
        if f["mimeType"] == GOOGLE_DOC_MIME and f["name"].startswith(NOTES_PREFIX)
    ]


def list_all_files_in_folder(folder_id: str) -> list[dict]:
    """Everything, for the admin picker."""
    service = get_drive_service()
    return _list_all_files(service, folder_id)


# ── Export / inspect ─────────────────────────────────────

def export_doc_as_text(doc_id: str) -> str:
    """Fast plain-text export. Does NOT capture text embedded in images."""
    service = get_drive_service()
    response = service.files().export(fileId=doc_id, mimeType="text/plain").execute()
    return response.decode("utf-8")


def export_doc_as_pdf(doc_id: str) -> bytes:
    """PDF export — preserves images/layout so a multimodal model can read image-text."""
    service = get_drive_service()
    return service.files().export(fileId=doc_id, mimeType="application/pdf").execute()


def doc_has_images(doc_id: str) -> bool:
    """True if the Doc contains inline images (worth a multimodal parse)."""
    docs = get_docs_service()
    doc = docs.documents().get(documentId=doc_id).execute()
    return bool(doc.get("inlineObjects"))


def get_doc_metadata(doc_id: str) -> dict:
    service = get_drive_service()
    return service.files().get(fileId=doc_id, fields="id, name, modifiedTime").execute()


def setup_drive_watch(doc_id: str, webhook_url: str, channel_id: str) -> dict:
    service = get_drive_service()
    body = {"id": channel_id, "type": "web_hook", "address": webhook_url}
    return service.files().watch(fileId=doc_id, body=body).execute()