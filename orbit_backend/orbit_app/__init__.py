from orbit_app.celery import app as celery_app  # noqa: F401  (deferred: only for `celery -A orbit_app` / manage.py; self-tests must not import it via PYTHONPATH=orbit_app)
