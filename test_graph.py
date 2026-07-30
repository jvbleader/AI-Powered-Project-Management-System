import asyncio
from app.services.ai_services.graph import project_graph
from langchain_core.messages import HumanMessage
from app.core.connection import SessionLocal

async def main():
    db = SessionLocal()
    from app.models.user_model import User
    current_user = db.query(User).first()
    config = {
        "configurable": {
            "thread_id": 999,
            "db": db,
            "project_id": 1,
            "current_user": current_user,
        }
    }
    initial_state = {
        "messages": [HumanMessage(content="Tôi muốn tạo một task mới trong dự án này tên là 'Thiết kế cơ sở dữ liệu'")]
    }
    async for event in project_graph.astream_events(initial_state, config, version="v2"):
        if event["event"] == "on_chat_model_stream":
            print(event["data"]["chunk"].content, end="", flush=True)
        elif event["event"] == "on_tool_start":
            print(f"\n[Tool Start] {event['name']}")
    print("\n[Done]")

if __name__ == "__main__":
    asyncio.run(main())
