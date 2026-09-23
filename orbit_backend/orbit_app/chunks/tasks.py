"""Celery tasks for Step 2: chunk + embed ingestion."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30, name="chunks.ingest_message")
def ingest_message_task(self, message_id, text=None, chunk_size=512, chunk_overlap=64):
    """Split a Message text, embed it, and save rows to the chunks table."""
    from orbit_app.chunks.services import ingest_message_chunks
    try:
        created = ingest_message_chunks(message_id=message_id, text=text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        logger.info("Ingested %d chunks for message %s.", len(created), message_id)
        return {"message_id": message_id, "chunks_created": len(created)}
    except Exception as exc:
        logger.exception("Chunk ingestion failed for message %s.", message_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30, name="chunks.ingest_text")
def ingest_text_task(self, message_id, text, chunk_size=512, chunk_overlap=64):
    """Ingest arbitrary (e.g. document) text linked to a message."""
    return ingest_message_task.run(message_id=message_id, text=text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
