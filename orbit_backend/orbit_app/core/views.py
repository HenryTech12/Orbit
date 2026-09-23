"""Unified API gateway views (Sentinel health + Grounded Copilot chat)."""
import logging
import time

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from orbit_app.core.serializers import ChatRequestSerializer, ChatResponseSerializer

from .responses import success as envelope_success

logger = logging.getLogger(__name__)


class ResponseWrapper:
    """Standard API envelope: {"status": ..., "message": "...", "data": ...}."""

    @staticmethod
    def success(data=None, message="OK", status_code=status.HTTP_200_OK):
        return envelope_success(data=data, message=message, status=status_code)

    @staticmethod
    def error(message="Request failed.", errors=None, status_code=status.HTTP_400_BAD_REQUEST):
        from .responses import error as envelope_error
        return envelope_error(message=message, status=status_code, errors=errors)


def _citation_objects(context_chunks: list) -> list:
    citations = []
    for chunk in context_chunks or []:
        citations.append({
            "message_id": chunk.get("message_id"),
            "text": (chunk.get("text", "") or "")[:500],
            "source_type": chunk.get("source_type", "unknown") or "unknown",
        })
    return citations


def _action_item_objects(message_ids: list) -> list:
    if not message_ids:
        return []
    try:
        from django.apps import apps
        Chunk = apps.get_model("orbitbackend", "Chunk")
        ActionItem = apps.get_model("orbitbackend", "ActionItem")
        chunk_ids = list(Chunk.objects.filter(message_id__in=message_ids).values_list("chunk_id", flat=True))
        items = ActionItem.objects.filter(source_chunk_id__in=chunk_ids).select_related("topic")[:20]
        payload = []
        for item in items:
            payload.append({
                "task": item.description, "description": item.description,
                "owner": item.owner, "deadline": str(item.deadline) if item.deadline else None,
                "priority": "medium",
            })
        return payload
    except Exception as exc:
        logger.debug("ActionItem lookup failed (%s).", exc)
        return []


class GroundedResponder:
    """Grounded Copilot engine: hybrid retrieval + grounded generation."""

    def respond(self, message="", query=None, question=None, top_k=5, alpha=0.5, context_filter=None):
        text = (message or query or question or "").strip() if isinstance((message or query or question), str) else ""
        # Fall back across aliases when the primary is empty.
        for candidate in (message, query, question):
            if isinstance(candidate, str) and candidate.strip():
                text = candidate.strip()
                break
        started = time.perf_counter()
        from orbit_app.core.services.responder import generate_grounded_response
        result = generate_grounded_response(
            text, top_k=top_k, alpha=alpha, context_filter=context_filter or None,
        )
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        chunks = result.get("context_chunks", []) or []
        message_ids = [c.get("message_id") for c in chunks if c.get("message_id") is not None]
        payload = {
            "answer": result.get("answer", ""),
            "trust_status": result.get("trust_status", "unknown"),
            "confidence": float(result.get("confidence", 0.0) or 0.0),
            "citations": _citation_objects(chunks),
            "action_items": _action_item_objects(message_ids),
            "contradictions": result.get("contradictions", []) or [],
            "retrieval_meta": {
                "top_k": top_k, "alpha": float(alpha), "hits": len(chunks),
                "latency_ms": latency_ms,
                "backend": result.get("backend", "unknown"),
                "retrieval": result.get("retrieval", "hybrid_search"),
            },
        }
        response_serializer = ChatResponseSerializer(data=payload)
        response_serializer.is_valid(raise_exception=True)
        return response_serializer.validated_data


class HealthCheckView(APIView):
    """GET /api/health/ — liveness probe wrapped in the standard envelope."""

    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        return ResponseWrapper.success({'healthy': True}, message='Service is healthy.')


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return ResponseWrapper.success({'healthy': True}, message='Service is healthy.')


class ChatCopilotView(APIView):
    """POST /api/v1/chat (aliases POST /copilot/ask, POST /api/copilot/ask): grounded copilot answer."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        started = time.perf_counter()
        incoming = dict(request.data) if hasattr(request.data, "keys") else {}
        # Accept `question` (WhatsApp) as an alias of `message`/`query` (frontend/gateway).
        if isinstance(request.data, dict):
            if not incoming.get("message") and not incoming.get("query") and incoming.get("question"):
                incoming["message"] = incoming.get("question")
        else:
            try:
                raw_question = request.data.get("question")
                raw_message = request.data.get("message")
                raw_query = request.data.get("query")
            except Exception:
                raw_question = raw_message = raw_query = None
            if not raw_message and not raw_query and raw_question:
                incoming = {"message": raw_question}
                try:
                    for key in ("top_k", "alpha", "stream", "context_filter"):
                        value = request.data.get(key)
                        if value is not None:
                            incoming[key] = value
                except Exception:
                    pass
        serializer = ChatRequestSerializer(data=incoming or request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        message = data.get("message", "")
        query = data.get("query", "")
        raw = request.data.get("question") if hasattr(request.data, "get") else None
        question = raw if isinstance(raw, str) else ""
        top_k = data.get("top_k", 5)
        alpha = data.get("alpha", 0.5)
        context_filter = data.get("context_filter") or {}
        try:
            output = GroundedResponder().respond(
                message=message, query=query, question=question,
                top_k=top_k, alpha=alpha, context_filter=context_filter or None,
            )
        except Exception as exc:
            logger.exception("Chat copilot pipeline failed for query %r.", (query or message or question)[:200])
            latency_ms = round((time.perf_counter() - started) * 1000, 2)
            detail = str(exc)
            if getattr(settings, "DEBUG", False):
                import traceback
                detail = traceback.format_exc(limit=5)
            return Response(
                {"detail": "Copilot pipeline failed.", "error": str(exc),
                 "diagnostic": detail, "latency_ms": latency_ms},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return ResponseWrapper.success(output, message="Copilot answer generated.")
