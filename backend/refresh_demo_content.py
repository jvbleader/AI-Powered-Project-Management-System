from app.core.connection import SessionLocal
from app.demo_content import rewrite_demo_content


def main() -> None:
    db = SessionLocal()
    try:
        summary = rewrite_demo_content(db)
        print(
            "Updated demo content:",
            ", ".join(f"{key}={value}" for key, value in summary.items()),
        )
    finally:
        db.close()


if __name__ == "__main__":
    main()
