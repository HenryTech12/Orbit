import os

from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'orbitbackend.settings')

app = Celery('orbitbackend')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
