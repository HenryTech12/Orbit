from django.db import models

from orbitbackend.softdelete import SoftDeleteModel


class ActionItem(SoftDeleteModel):
    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        IN_PROGRESS = 'in_progress', 'In Progress'
        DONE = 'done', 'Done'

    action_item_id = models.BigAutoField(primary_key=True)
    topic = models.ForeignKey(
        'orbitbackend.Topic',
        on_delete=models.CASCADE,
        related_name='action_items',
    )
    description = models.TextField()
    owner = models.CharField(max_length=255, null=True, blank=True)
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    source_chunk = models.ForeignKey(
        'orbitbackend.Chunk',
        on_delete=models.CASCADE,
        related_name='action_items',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'action_items'

    def __str__(self):
        return f'{self.description[:50]} ({self.status})'
