from django.db import models

from orbitbackend.softdelete import SoftDeleteModel


class Classification(SoftDeleteModel):
    class Category(models.TextChoices):
        ANNOUNCEMENT = 'announcement', 'Announcement'
        GENERAL = 'general', 'General'

    class ItemType(models.TextChoices):
        QUESTION = 'question', 'Question'
        DECISION = 'decision', 'Decision'
        ACTION_ITEM = 'action_item', 'Action Item'

    classification_id = models.BigAutoField(primary_key=True)
    chunk = models.ForeignKey(
        'orbitbackend.Chunk',
        on_delete=models.CASCADE,
        related_name='classifications',
    )
    category = models.CharField(max_length=16, choices=Category.choices)
    topic_label = models.CharField(max_length=255)
    item_type = models.CharField(max_length=16, choices=ItemType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'classifications'

    def __str__(self):
        return f'{self.category}/{self.item_type} "{self.topic_label}" for chunk {self.chunk_id}'
