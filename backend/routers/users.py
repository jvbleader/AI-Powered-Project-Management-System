from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.connection import get_db
from models.user_model import User
from dependencies import get_current_user
from schemas.user_schema import UserProfile

router = APIRouter()

@router.get("/me", response_model = UserProfile)
def profile(current_user: User = Depends(get_current_user)):
    return current_user