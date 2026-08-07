import asyncio
import json
from app.core.connection import SessionLocal
from app.repositories.user_repository import get_user_by_id
from app.services.ai_services.core import get_or_create_graph
from langchain_core.messages import HumanMessage

async def test():
    db = SessionLocal()
    user = get_user_by_id(db, 32)
    graph = get_or_create_graph()
    
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
