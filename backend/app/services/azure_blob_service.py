import base64
import uuid
import mimetypes
from io import BytesIO
from typing import Optional
from azure.storage.blob import BlobServiceClient
from app.config.settings import get_settings

settings = get_settings()

class AzureBlobService:
    def __init__(self):
        self.connection_string = settings.azure_storage_connection_string
        self.container_name = settings.azure_storage_container_name
        self.blob_service_client = None

        if self.connection_string:
            try:
                self.blob_service_client = BlobServiceClient.from_connection_string(self.connection_string)
            except Exception as e:
                print(f"Failed to initialize Azure Blob Service Client: {e}")

    def upload_base64_avatar(self, base64_data: str, user_id: int) -> str:
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

            if "base64," in base64_data:
                header, encoded = base64_data.split("base64,", 1)
                mime_type = header.split(":")[1].split(";")[0] if ":" in header else "image/jpeg"
                extension = mime_map.get(mime_type.lower()) or mimetypes.guess_extension(mime_type) or ".jpg"
                if extension == ".jfif":
                    extension = ".jpg"
            else:
                encoded = base64_data
                extension = ".jpg"

            image_data = base64.b64decode(encoded)
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
                    container_client = self.blob_service_client.get_container_client(self.container_name)
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

        except Exception as e:
            print(f"Error uploading avatar to Azure: {e}")
            # Fallback to the original base64 string if upload fails
            return base64_data

azure_blob_service = AzureBlobService()
