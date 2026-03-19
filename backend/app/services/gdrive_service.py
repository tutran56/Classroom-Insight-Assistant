import json
import tempfile
from pathlib import Path
from typing import Optional

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

from app.core.config import settings

SCOPES = ["https://www.googleapis.com/auth/drive"]


def get_drive_service():
    creds = None
    token_path = settings.GOOGLE_DRIVE_TOKEN_FILE
    client_path = settings.GOOGLE_DRIVE_OAUTH_CLIENT_FILE

    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(client_path), SCOPES)
            creds = flow.run_local_server(port=0)

        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")

    return build("drive", "v3", credentials=creds)


def create_drive_folder(name: str, parent_id: Optional[str] = None) -> str:
    service = get_drive_service()

    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
    }
    if parent_id:
        metadata["parents"] = [parent_id]

    folder = service.files().create(body=metadata, fields="id,name").execute()
    return folder["id"]


def upload_file_to_drive(
    local_path: Path,
    file_name: str,
    parent_id: str,
    mime_type: str = "application/octet-stream",
) -> str:
    service = get_drive_service()

    metadata = {
        "name": file_name,
        "parents": [parent_id],
    }

    media = MediaFileUpload(str(local_path), mimetype=mime_type, resumable=True)

    file = service.files().create(
        body=metadata,
        media_body=media,
        fields="id,name",
    ).execute()

    return file["id"]


def upload_text_content_to_drive(
    content: str,
    file_name: str,
    parent_id: str,
    mime_type: str = "application/json",
) -> str:
    tmp_path = Path("/tmp") / file_name
    tmp_path.write_text(content, encoding="utf-8")
    try:
        return upload_file_to_drive(
            local_path=tmp_path,
            file_name=file_name,
            parent_id=parent_id,
            mime_type=mime_type,
        )
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def list_drive_folders(parent_id: str):
    service = get_drive_service()

    response = service.files().list(
        q=f"'{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields="files(id,name)",
        pageSize=100,
    ).execute()

    return response.get("files", [])


def delete_drive_file(file_id: str):
    service = get_drive_service()
    service.files().delete(fileId=file_id).execute()


def find_drive_folder_by_name(parent_id: str, folder_name: str):
    service = get_drive_service()

    q = (
        f"'{parent_id}' in parents and "
        f"mimeType='application/vnd.google-apps.folder' and "
        f"name='{folder_name}' and trashed=false"
    )

    response = service.files().list(
        q=q,
        fields="files(id,name)",
        pageSize=10,
    ).execute()

    files = response.get("files", [])
    return files[0] if files else None


def find_drive_file_by_name(parent_id: str, file_name: str):
    service = get_drive_service()

    q = (
        f"'{parent_id}' in parents and "
        f"name='{file_name}' and trashed=false"
    )

    response = service.files().list(
        q=q,
        fields="files(id,name,mimeType)",
        pageSize=10,
    ).execute()

    files = response.get("files", [])
    return files[0] if files else None


def read_drive_json(file_id: str):
    service = get_drive_service()

    request = service.files().get_media(fileId=file_id)

    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        downloader = MediaIoBaseDownload(tmp, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()
        tmp_path = Path(tmp.name)

    try:
        return json.loads(tmp_path.read_text(encoding="utf-8"))
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def download_drive_folder_to_local(parent_folder_id: str, local_dir: Path):
    service = get_drive_service()
    local_dir.mkdir(parents=True, exist_ok=True)

    response = service.files().list(
        q=f"'{parent_folder_id}' in parents and trashed=false",
        fields="files(id,name,mimeType)",
        pageSize=200,
    ).execute()

    for item in response.get("files", []):
        item_id = item["id"]
        item_name = item["name"]
        mime_type = item["mimeType"]

        target_path = local_dir / item_name

        if mime_type == "application/vnd.google-apps.folder":
            download_drive_folder_to_local(item_id, target_path)
        else:
            request = service.files().get_media(fileId=item_id)
            with open(target_path, "wb") as f:
                downloader = MediaIoBaseDownload(f, request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()