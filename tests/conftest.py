import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app import models  # noqa: F401  (registers models on Base)


@pytest.fixture()
def db_session():
    """A fresh in-memory SQLite database for every single test, so
    tests never see each other's data and can run in any order.

    StaticPool is required here: without it, SQLAlchemy hands out a new
    connection per checkout, and each connection to a `:memory:` SQLite
    URL is its own separate, empty database - the tables created via
    create_all would live on a connection nobody queries from again.
    StaticPool pins the whole engine to one single connection instead.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
