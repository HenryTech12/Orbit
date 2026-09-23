"""Step 5: end-to-end master test — ingest -> chunk/embed -> extract -> chat."""
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from orbit_app.messages.models import Message


class CopilotPipelineTest(APITestCase):
    """Full pipeline: Message -> chunks -> extraction -> POST /api/v1/chat."""

    CHAT_URL = "/api/v1/chat/"
    COPILOT_ALIAS = "/copilot/ask/"
    RAW_TEXT = (
        "Official decision: the Postgres migration was approved for Friday. "
        "Ada to draft the migration plan."
    )

    def setUp(self):
        self.message = Message.objects.create(
            source_type="pdf",
            sender="PMO",
            timestamp=timezone.now(),
            raw_text=self.RAW_TEXT,
            authority_level="official",
        )

    def test_end_to_end_grounded_and_ungrounded(self):
        from orbit_app.chunks.services import ingest_message_chunks
        from orbit_app.classifications.services import save_extraction_results

        # Step 2: chunking + embedding persistence.
        chunks = ingest_message_chunks(message=self.message)
        self.assertGreaterEqual(len(chunks), 1)
        self.assertEqual(len(chunks[0].embedding), 384)

        # Step 3: structured extraction persistence.
        result = save_extraction_results(message=self.message)
        self.assertTrue(result["topic"].label)
        self.assertGreaterEqual(len(result["classifications"]), 1)

        # Step 4/5: grounded query -> 200 + verified + facts + citations.
        grounded = self.client.post(
            self.CHAT_URL,
            {"message": "When was the Postgres migration approved?", "top_k": 5, "alpha": 0.5},
            format="json",
        )
        self.assertEqual(grounded.status_code, status.HTTP_200_OK)
        self.assertEqual(grounded.data["trust_status"], "verified")
        self.assertIn("Postgres", grounded.data["answer"])
        self.assertIn("Friday", grounded.data["answer"])
        self.assertTrue(grounded.data["citations"])
        self.assertEqual(grounded.data["citations"][0]["message_id"], self.message.pk)
        self.assertIn("retrieval_meta", grounded.data)
        self.assertGreaterEqual(grounded.data["retrieval_meta"]["hits"], 1)
        self.assertIn("contradictions", grounded.data)
        self.assertIn("action_items", grounded.data)

        # Alias route behaves identically.
        alias = self.client.post(
            self.COPILOT_ALIAS,
            {"query": "When was the Postgres migration approved?"},
            format="json",
        )
        self.assertEqual(alias.status_code, status.HTTP_200_OK)
        self.assertEqual(alias.data["trust_status"], "verified")

        # Ungrounded query -> 200 + unknown (hallucination guardrail).
        ungrounded = self.client.post(
            self.CHAT_URL,
            {"message": "What is the lunch menu on Mars?"},
            format="json",
        )
        self.assertEqual(ungrounded.status_code, status.HTTP_200_OK)
        self.assertEqual(ungrounded.data["trust_status"], "unknown")

    def test_request_validation(self):
        empty = self.client.post(self.CHAT_URL, {}, format="json")
        self.assertEqual(empty.status_code, status.HTTP_400_BAD_REQUEST)
        bad_alpha = self.client.post(
            self.CHAT_URL, {"message": "hi", "alpha": 9.0}, format="json"
        )
        self.assertEqual(bad_alpha.status_code, status.HTTP_400_BAD_REQUEST)
