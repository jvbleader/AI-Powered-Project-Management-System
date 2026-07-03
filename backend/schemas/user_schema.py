from pydantic import BaseModel, EmailStr


class UserLogin(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class UserProfile(BaseModel):
    id: int
    email: EmailStr
    full_name: str | None = None
    is_active: bool
    is_admin: bool

    class Config:
        from_attributes = True


class ChangePassword(BaseModel):
    old_password: str
    new_password: str
