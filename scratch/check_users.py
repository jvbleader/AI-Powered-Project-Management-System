import requests

BASE_URL = "http://localhost:8000"

def login(email, password="default1234"):
    r = requests.post(f"{BASE_URL}/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json()["access_token"]
    return None

def test():
    # Attempt to login with an admin or first user.
    # But wait, I don't know the emails. Let me fetch users from DB directly or via python.
    pass

test()
