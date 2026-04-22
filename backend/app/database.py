import os
import json
import time
import psycopg2
from psycopg2 import pool as pg_pool
from dotenv import load_dotenv

load_dotenv()

_pool: pg_pool.ThreadedConnectionPool = None

# ─────────────────────────────────────────────
# Simple in-memory cache (drop-in Redis replacement)
# Replace with redis.Redis() for production
# ─────────────────────────────────────────────
_cache: dict = {}
CACHE_TTL = 60  # seconds


def cache_get(key: str):
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() > entry["expires_at"]:
        del _cache[key]
        return None
    return entry["value"]


def cache_set(key: str, value, ttl: int = CACHE_TTL):
    _cache[key] = {
        "value": value,
        "expires_at": time.time() + ttl,
    }


def init_pool():
    global _pool
    dsn = os.getenv("DATABASE_URL")
    if "sslmode" not in dsn:
        dsn += "?sslmode=require"
    _pool = pg_pool.ThreadedConnectionPool(minconn=2, maxconn=10, dsn=dsn)
    print("[DB] Connection pool initialized")


def close_pool():
    global _pool
    if _pool:
        _pool.closeall()
        print("[DB] Connection pool closed")


def get_pool() -> pg_pool.ThreadedConnectionPool:
    return _pool