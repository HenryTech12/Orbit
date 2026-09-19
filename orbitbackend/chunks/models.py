from django.contrib.postgres.fields import ArrayField
from django.db import models

from orbitbackend.softdelete import SoftDeleteModel


class Chunk(SoftDeleteModel):
    chunk_id = models.BigAutoField(primary_key=True)
    message = models.ForeignKey(
        'orbitbackend.Message',
        on_delete=models.CASCADE,
        related_name='chunks',
    )
    text = models.TextField()
    embedding = ArrayField(models.FloatField(), null=True, blank=True)
    token_start = models.PositiveIntegerField()
    token_end = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chunks'

    def __str__(self):
        return f'chunk {self.chunk_id} of message {self.message_id} [{self.token_start}:{self.token_end}]'
