from django.db import models
from django.utils import timezone

from orbitbackend.softdelete import SoftDeleteModel


class TopicHistory(SoftDeleteModel):
    topic_history_id = models.BigAutoField(primary_key=True)
    topic = models.ForeignKey(
        'orbitbackend.Topic',
        on_delete=models.CASCADE,
        related_name='history',
    )
    chunk = models.ForeignKey(
        'orbitbackend.Chunk',
        on_delete=models.CASCADE,
        related_name='topic_history',
    )
    timestamp = models.DateTimeField(default=timezone.now)
    # Powers "what changed between X and Y".
    value_snapshot = models.TextField()

    class Meta:
        db_table = 'topic_history'

    def __str__(self):
        return f'topic {self.topic_id} @ {self.timestamp} (chunk {self.chunk_id})'
