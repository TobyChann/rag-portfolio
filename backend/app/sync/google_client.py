# backend/app/sync/google_client.py
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
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
    files, page_token = [], None
    while True:
        results = service.files().list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="nextPageToken, files(id, name, mimeType, modifiedTime)",
            pageSize=1000,
            pageToken=page_token,
        ).execute()
        for item in results.get("files", []):
            if item["mimeType"] == "application/vnd.google-apps.folder":
                files.extend(_list_all_files(service, item["id"]))
            else:
                files.append(item)
        page_token = results.get("nextPageToken")
        if not page_token:
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


def get_doc_inline_images(doc_id: str) -> list[tuple[bytes, str]]:
    """Download each inline image in the Doc individually via the Docs API's
    per-image contentUri. This sidesteps Drive's ~10 MB whole-file export cap:
    every image is fetched on its own, so arbitrarily large image-heavy docs
    still yield their pictures for OCR. Returns [(image_bytes, mime_type)].
    Bad/expired image URLs are skipped, never fatal."""
    creds = _get_credentials()
    doc = build("docs", "v1", credentials=creds).documents().get(documentId=doc_id).execute()
    inline = doc.get("inlineObjects", {})
    if not inline:
        return []

    session = AuthorizedSession(creds)
    images: list[tuple[bytes, str]] = []
    for obj in inline.values():
        try:
            embedded = obj["inlineObjectProperties"]["embeddedObject"]
            uri = embedded.get("imageProperties", {}).get("contentUri")
            if not uri:
                continue
            resp = session.get(uri, timeout=30)
            if resp.status_code == 200 and resp.content:
                mime = resp.headers.get("Content-Type", "image/png").split(";")[0].strip()
                if not mime.startswith("image/"):
                    mime = "image/png"
                images.append((resp.content, mime))
        except Exception as e:
            print(f"[docimg] skipped an inline image in {doc_id}: {e}")
    return images


def get_doc_metadata(doc_id: str) -> dict:
    service = get_drive_service()
    return service.files().get(fileId=doc_id, fields="id, name, modifiedTime").execute()
