from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_read_main():
    # Since we don't have a root endpoint, we can test docs
    response = client.get("/docs")
    assert response.status_code == 200
