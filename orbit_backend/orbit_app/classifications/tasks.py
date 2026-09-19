"""Celery tasks for Step 3: chunking (Step 2) + structured extraction."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=30, name="classifications.process_message_extraction")
def process_message_extraction_task(self, message_id, text=None, context_metadata=None, chunk_size=512, chunk_overlap=64):
    """Run Step 2 chunking then Step 3 extraction + persistence for a message."""
    from orbit_app.chunks.services import ingest_message_chunks
    from orbit_app.classifications.services import extract_structured_metadata, save_extraction_results
    try:
        chunks = ingest_message_chunks(message_id=message_id, text=text, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
        result = save_extraction_results(message_id=message_id, text=text, context_metadata=context_metadata)
        extraction = result["extraction"]
        logger.info("Extraction done for message %s: topic=%r (%d chunks, %d actions).",
                    message_id, extraction.get("topic"), len(chunks), len(extraction.get("action_items", [])))
        return {"message_id": message_id, "topic": extraction.get("topic"), "category": extraction.get("category"),
                "chunks_created": len(chunks), "decisions": len(extraction.get("decisions", [])),
                "action_items": len(extraction.get("action_items", [])), "backend": extraction.get("_backend")}
    except Exception as exc:
        logger.exception("Extraction pipeline failed for message %s.", message_id)
        raise self.retry(exc=exc)


@shared_task(bind=True, max_retries=3, default_retry_delay=30, name="classifications.extract_text")
def extract_text_task(self, message_id, text, context_metadata=None):
    """Extract + persist arbitrary (document) text linked to a message."""
    return process_message_extraction_task.run(message_id=message_id, text=text, context_metadata=context_metadata)
