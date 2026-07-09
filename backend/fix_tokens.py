from app.core.connection import SessionLocal, engine
from app.models.refresh_token_model import RefreshToken
from sqlalchemy import text

db = SessionLocal()
db.execute(text("SET FOREIGN_KEY_CHECKS = 0;"))
db.query(RefreshToken).delete()
db.execute(text("SET FOREIGN_KEY_CHECKS = 1;"))
db.commit()
print("Refresh tokens deleted")
