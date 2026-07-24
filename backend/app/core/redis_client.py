import redis
from app.config.settings import get_settings

settings = get_settings()

REDIS_HOST = settings.redis_host
REDIS_PORT = settings.redis_port

pool = redis.ConnectionPool(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)
redis_client = redis.Redis(connection_pool=pool)
