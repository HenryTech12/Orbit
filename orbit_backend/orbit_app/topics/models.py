from django.db import models

from orbit_app.softdelete import SoftDeleteModel


class Topic(SoftDeleteModel):
    class Status(models.TextChoices):
        CONFIRMED = 'confirmed', 'Confirmed'
        DISPUTED = 'disputed', 'Disputed'
        STALE = 'stale', 'Stale'
        UNKNOWN = 'unknown', 'Unknown'

    topic_id = models.BigAutoField(primary_key=True)
    label = models.CharField(max_length=255)
    latest_status = models.CharField(max_length=16, choices=Status.choices, default=Status.UNKNOWN)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'topics'

    def __str__(self):
        return f'{self.label} ({self.latest_status})'
