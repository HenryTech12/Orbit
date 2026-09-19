from django.db import models

from orbitbackend.softdelete import SoftDeleteModel


class Message(SoftDeleteModel):
    class SourceType(models.TextChoices):
        WHATSAPP = 'whatsapp', 'WhatsApp'
        MEETING_TRANSCRIPT = 'meeting_transcript', 'Meeting Transcript'
        PDF = 'pdf', 'PDF'

    class AuthorityLevel(models.TextChoices):
        OFFICIAL = 'official', 'Official'
        GENERAL = 'general', 'General'

    message_id = models.BigAutoField(primary_key=True)
    source_type = models.CharField(max_length=32, choices=SourceType.choices)
    sender = models.CharField(max_length=255)
    timestamp = models.DateTimeField()
    raw_text = models.TextField()
    authority_level = models.CharField(max_length=16, choices=AuthorityLevel.choices)

    class Meta:
        db_table = 'messages'

    def __str__(self):
        return f'{self.source_type} message from {self.sender} at {self.timestamp}'
