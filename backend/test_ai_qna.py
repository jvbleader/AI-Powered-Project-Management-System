import asyncio
import json
from app.core.connection import SessionLocal
from app.models.user_model import User
from app.models.department_model import Department
from app.models.notification_model import Notification
from app.services.ai_services.graph import project_graph
from langchain_core.messages import HumanMessage

async def test():
    db = SessionLocal()
    user = db.query(User).filter(User.id == 32).first()
    graph = project_graph
    
    config = {
        "configurable": {
            "thread_id": "test_session_52",
            "db": db,
            "current_user": user,
            "project_id": 15
        }
    }
    
    messages = [
        HumanMessage(content="Cho tôi xem logwork của team trong tuần vừa qua ở dự án Method."),
        HumanMessage(content="những ai chưa logwrk trong ngày hôm qua")
    ]
    
    state = {"messages": messages}
    async for event in graph.astream(state, config=config, stream_mode="values"):
        if "messages" in event:
            print("Latest message:", event["messages"][-1].content)

if __name__ == "__main__":
    asyncio.run(test())
