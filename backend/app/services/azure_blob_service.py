import base64
import mimetypes
import re
import uuid

from azure.storage.blob import BlobServiceClient

from app.core.config import get_settings

settings = get_settings()

MAX_AVATAR_BYTES = 5 * 1024 * 1024
AVATAR_DATA_URL = re.compile(
    r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$",
    re.IGNORECASE,
)


def _decode_avatar(base64_data: str) -> tuple[str, bytes]:
    match = AVATAR_DATA_URL.fullmatch((base64_data or "").strip())
    if not match:
        raise ValueError("Ảnh đại diện phải là dữ liệu JPG, PNG hoặc WebP hợp lệ.")

    mime_type = match.group(1).lower()
    try:
        image_data = base64.b64decode(match.group(2), validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("Dữ liệu ảnh đại diện không hợp lệ.") from exc

    if not image_data or len(image_data) > MAX_AVATAR_BYTES:
        raise ValueError("Ảnh đại diện phải có dung lượng tối đa 5 MB.")

    signatures = {
        "image/jpeg": image_data.startswith(b"\xff\xd8\xff"),
        "image/png": image_data.startswith(b"\x89PNG\r\n\x1a\n"),
        "image/webp": image_data.startswith(b"RIFF") and image_data[8:12] == b"WEBP",
    }
    if not signatures[mime_type]:
        raise ValueError("Nội dung tệp không phải là ảnh hợp lệ.")
    return mime_type, image_data


class AzureBlobService:
    def __init__(self):
        self.connection_string = settings.azure_storage_connection_string
        self.container_name = settings.azure_storage_container_name
        self.blob_service_client = None

        if self.connection_string:
            try:
                self.blob_service_client = BlobServiceClient.from_connection_string(
                    self.connection_string
                )
            except Exception as e:
                print(f"Failed to initialize Azure Blob Service Client: {e}")

    def upload_base64_avatar(self, base64_data: str, user_id: int) -> str:
        mime_type, image_data = _decode_avatar(base64_data)
        if not self.blob_service_client:
            return base64_data

        try:
            mime_map = {
                "image/jpeg": ".jpg",
                "image/jpg": ".jpg",
                "image/png": ".png",
                "image/webp": ".webp",
                "image/gif": ".gif",
            }

            extension = mime_map.get(mime_type) or mimetypes.guess_extension(mime_type) or ".jpg"
            if extension == ".jfif":
                extension = ".jpg"
            file_name = f"avatar_user_{user_id}_{uuid.uuid4().hex[:8]}{extension}"

            blob_client = self.blob_service_client.get_blob_client(
                container=self.container_name, blob=file_name
            )

            # Upload blob data, auto-creating container if needed
            try:
                blob_client.upload_blob(image_data, overwrite=True)
            except Exception as upload_err:
                err_str = str(upload_err).lower()
                if "container" in err_str or "notfound" in err_str or "404" in err_str:
                    container_client = self.blob_service_client.get_container_client(
                        self.container_name
                    )
                    try:
                        container_client.create_container(public_access="blob")
                    except Exception:
                        pass
                    blob_client.upload_blob(image_data, overwrite=True)
                else:
                    raise upload_err

            # Construct the public URL
            blob_url = blob_client.url
            return blob_url

        except Exception as exc:
            raise RuntimeError("Không thể tải ảnh đại diện lên kho lưu trữ.") from exc


azure_blob_service = AzureBlobService()
