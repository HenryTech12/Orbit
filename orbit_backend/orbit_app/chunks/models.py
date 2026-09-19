from django.db import models

from orbit_app.softdelete import SoftDeleteModel


def _embedding_field():
    """Postgres -> native ArrayField; other backends -> JSONField fallback.

    Must be decided lazily (at class definition, per settings ENGINE) so
    sqlite self-tests don't create a ``real[]`` column sqlite can't write.
    """
    from django.conf import settings as _settings

    try:
        engine = (_settings.DATABASES.get('default', {}).get('ENGINE') or '')
    except Exception:
        engine = ''
    if 'postgresql' in engine or 'postgis' in engine:
        from django.contrib.postgres.fields import ArrayField

        return ArrayField(models.FloatField(), null=True, blank=True)
    return models.JSONField(null=True, blank=True)


class Chunk(SoftDeleteModel):
    chunk_id = models.BigAutoField(primary_key=True)
    message = models.ForeignKey(
        'orbitbackend.Message',
        on_delete=models.CASCADE,
        related_name='chunks',
    )
    text = models.TextField()
    embedding = _embedding_field()
    token_start = models.PositiveIntegerField()
    token_end = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'chunks'

    def __str__(self):
        return f'chunk {self.chunk_id} of message {self.message_id} [{self.token_start}:{self.token_end}]'
