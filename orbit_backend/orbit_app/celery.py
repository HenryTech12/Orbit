import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'orbit_app.settings')

app = Celery('orbit_app')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
