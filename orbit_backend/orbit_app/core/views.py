"""Step 5: API gateway views (chat copilot + health)."""
import logging
import time

from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from orbit_app.core.serializers import ChatRequestSerializer, ChatResponseSerializer

logger = logging.getLogger(__name__)


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "ok"})


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


class ChatCopilotView(APIView):
    """POST /api/v1/chat (alias POST /copilot/ask): grounded copilot answer."""

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        started = time.perf_counter()
        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        query = data["query"]
        top_k = data.get("top_k", 5)
        alpha = data.get("alpha", 0.5)
        context_filter = data.get("context_filter") or {}
        try:
            from orbit_app.core.services.responder import generate_grounded_response
            result = generate_grounded_response(
                query, top_k=top_k, alpha=alpha, context_filter=context_filter or None,
            )
        except Exception as exc:
            logger.exception("Chat copilot pipeline failed for query %r.", query[:200])
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
        return Response(response_serializer.validated_data, status=status.HTTP_200_OK)
