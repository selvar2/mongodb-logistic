"""MongoDB Atlas client (synchronous PyMongo).

A single shared client is created lazily. All collection access goes through
the helpers here so collection names stay consistent with config.settings.
"""
from __future__ import annotations

from functools import lru_cache

from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

from app.config import settings


@lru_cache
def get_client() -> MongoClient:
    return MongoClient(settings.mongodb_uri, appname="resiliochain")


def get_db() -> Database:
    return get_client()[settings.mongodb_db]


def col(name: str) -> Collection:
    return get_db()[name]


def ping() -> bool:
    """Return True if the cluster responds to a ping."""
    get_client().admin.command("ping")
    return True
