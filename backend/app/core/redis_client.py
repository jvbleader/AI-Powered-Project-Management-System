import redis

from app.core.config import get_settings

settings = get_settings()

pool_options = {
    "host": settings.redis_host,
    "port": settings.redis_port,
    "db": settings.redis_db,
    "username": settings.redis_username,
    "password": settings.redis_password,
    "decode_responses": True,
}

# redis-py selects SSL via the connection class. Passing ``ssl=False`` to a
# regular TCP connection leaks an unsupported keyword to AbstractConnection.
if settings.redis_ssl:
    pool_options["connection_class"] = redis.SSLConnection

pool = redis.ConnectionPool(
    **pool_options,
)
redis_client = redis.Redis(connection_pool=pool)
