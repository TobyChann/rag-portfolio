# backend/app/sync/google_client.py
from google.oauth2 import service_account
from googleapiclient.discovery import build
from app.config import get_settings

settings = get_settings()

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/documents.readonly",
]

# Only ingest files whose name starts with this prefix
NOTES_PREFIX = "Notes_"


def _get_credentials():
    return service_account.Credentials.from_service_account_file(
        settings.google_service_account_path,
        scopes=SCOPES,
    )


def get_drive_service():
    return build("drive", "v3", credentials=_get_credentials())


def get_docs_service():
    return build("docs", "v1", credentials=_get_credentials())


def list_docs_in_folder(folder_id: str) -> list[dict]:
    """
    Recursively find all Google Docs in a folder and subfolders,
    but only those whose filename starts with 'Notes_'.
    Returns list of {id, name, modifiedTime}.
    """
    service = get_drive_service()
    all_docs = _recursive_list(service, folder_id)
    filtered = [d for d in all_docs if d["name"].startswith(NOTES_PREFIX)]
    skipped = len(all_docs) - len(filtered)
    if skipped:
        print(f"[google] Skipped {skipped} files not matching '{NOTES_PREFIX}*'")
    return filtered


def _recursive_list(service, folder_id: str) -> list[dict]:
    docs = []
    results = service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id, name, mimeType, modifiedTime)",
    ).execute()
    for item in results.get("files", []):
        if item["mimeType"] == "application/vnd.google-apps.document":
            docs.append(item)
        elif item["mimeType"] == "application/vnd.google-apps.folder":
            docs.extend(_recursive_list(service, item["id"]))
    return docs


def export_doc_as_pdf(doc_id: str) -> bytes:
    service = get_drive_service()
    return service.files().export(
        fileId=doc_id,
        mimeType="application/pdf",
    ).execute()


def get_doc_metadata(doc_id: str) -> dict:
    service = get_drive_service()
    return service.files().get(
        fileId=doc_id,
        fields="id, name, modifiedTime"
    ).execute()


def setup_drive_watch(doc_id: str, webhook_url: str, channel_id: str) -> dict:
    service = get_drive_service()
    body = {
        "id": channel_id,
        "type": "web_hook",
        "address": webhook_url,
    }
    return service.files().watch(fileId=doc_id, body=body).execute()