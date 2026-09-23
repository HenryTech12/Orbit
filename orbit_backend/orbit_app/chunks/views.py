"""DRF views for the chunks app (Step 2 ingestion endpoints)."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from orbit_app.chunks.serializers import ChunkSerializer, IngestChunksSerializer


@api_view(["POST"])
@permission_classes([AllowAny])
def ingest_chunks(request):
    """Chunk + embed text for a message and persist rows to chunks table."""
    serializer = IngestChunksSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    from orbit_app.chunks.services import ingest_message_chunks
    created = ingest_message_chunks(
        message_id=data["message_id"],
        text=data.get("text"),
        chunk_size=data.get("chunk_size", 512),
        chunk_overlap=data.get("chunk_overlap", 64),
    )
    return Response(
        {"message_id": data["message_id"], "chunks_created": len(created), "chunks": ChunkSerializer(created, many=True).data},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def enqueue_ingest_chunks(request):
    """Enqueue chunk ingestion as a Celery task; returns the task id."""
    serializer = IngestChunksSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    from orbit_app.chunks.tasks import ingest_message_task
    task = ingest_message_task.delay(message_id=data["message_id"], text=data.get("text"), chunk_size=data.get("chunk_size", 512), chunk_overlap=data.get("chunk_overlap", 64))
    return Response({"task_id": task.id, "message_id": data["message_id"]}, status=status.HTTP_202_ACCEPTED)
