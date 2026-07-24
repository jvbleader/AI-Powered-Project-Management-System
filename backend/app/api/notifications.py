from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List

from app.core.connection import get_db
from app.models.notification_model import Notification
from app.core.dependencies import get_current_user
from app.models.user_model import User
from app.services.websocket_manager import manager
from app.utils.jwt_handler import decode_token, create_access_token

router = APIRouter()

@router.get("/ws-token")
def get_ws_token(current_user: User = Depends(get_current_user)):
    token = create_access_token(data={"sub": str(current_user.id)})
    return {"token": token}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
        if not user_id:
            await websocket.close(code=1008)
            return
    except Exception:
        await websocket.close(code=1008)
        return

    await manager.connect(websocket, user_id)
    try:
        while True:
            # Keep connection alive, listen for mark-as-read or ping from client
            data = await websocket.receive_text()
            # If client sends {"action": "ping"}, we can just continue
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)


@router.get("")
def get_my_notifications(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get persistent notifications for the logged in user."""
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(desc(Notification.created_at))
        .offset(skip)
        .limit(limit)
        .all()
    )
    
    # Manually serialize to dict
    return [
        {
            "id": n.id,
            "type": n.type,
            "title": n.title,
            "content": n.content,
            "link": n.link,
            "is_read": n.is_read,
            "created_at": n.created_at.isoformat()
        }
        for n in notifications
    ]


@router.put("/{notification_id}/read")
def mark_as_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    if notification:
        notification.is_read = True
        db.commit()
    return {"status": "ok"}
