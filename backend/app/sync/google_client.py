from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import io
from app.config import get_settings

settings = get_settings()

SCOPES = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/documents.readonly",
]


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
    Recursively find all Google Docs in a folder and all its subfolders.
    Returns list of {id, name, modifiedTime}.
    """
    service = get_drive_service()
    return _recursive_list(service, folder_id)


def _recursive_list(service, folder_id: str) -> list[dict]:
    docs = []

    # Get all items in this folder
    results = service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id, name, mimeType, modifiedTime)",
    ).execute()

    for item in results.get("files", []):
        if item["mimeType"] == "application/vnd.google-apps.document":
            # It's a Doc — add it
            docs.append(item)
        elif item["mimeType"] == "application/vnd.google-apps.folder":
            # It's a subfolder — recurse into it
            docs.extend(_recursive_list(service, item["id"]))

    return docs


def export_doc_as_pdf(doc_id: str) -> bytes:
    """Export a Google Doc as PDF bytes (preserves images + layout)."""
    service = get_drive_service()
    response = service.files().export(
        fileId=doc_id,
        mimeType="application/pdf",
    ).execute()
    return response


def export_doc_as_text(doc_id: str) -> str:
    """Export a Google Doc as plain text (fast, no images)."""
    service = get_drive_service()
    response = service.files().export(
        fileId=doc_id,
        mimeType="text/plain",
    ).execute()
    return response.decode("utf-8")


def get_doc_metadata(doc_id: str) -> dict:
    service = get_drive_service()
    return service.files().get(
        fileId=doc_id,
        fields="id, name, modifiedTime"
    ).execute()


def setup_drive_watch(doc_id: str, webhook_url: str, channel_id: str) -> dict:
    """
    Register a push notification channel for a file.
    Google will POST to webhook_url when the file changes.
    """
    service = get_drive_service()
    body = {
        "id": channel_id,
        "type": "web_hook",
        "address": webhook_url,
    }
    return service.files().watch(fileId=doc_id, body=body).execute()
