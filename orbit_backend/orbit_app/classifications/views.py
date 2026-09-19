"""DRF views for Step 3 structured extraction."""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from orbit_app.classifications.serializers import ExtractionRequestSerializer


@api_view(["POST"])
@permission_classes([AllowAny])
def extract_message(request):
    """Synchronously chunk + extract + persist for a message."""
    serializer = ExtractionRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    from orbit_app.classifications.tasks import process_message_extraction_task
    result = process_message_extraction_task.run(
        message_id=data["message_id"], text=data.get("text"),
        context_metadata=data.get("context_metadata"),
    )
    return Response(result, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([AllowAny])
def enqueue_extraction(request):
    """Enqueue the extraction pipeline; returns the Celery task id."""
    serializer = ExtractionRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data
    from orbit_app.classifications.tasks import process_message_extraction_task
    task = process_message_extraction_task.delay(
        message_id=data["message_id"], text=data.get("text"),
        context_metadata=data.get("context_metadata"),
    )
    return Response({"task_id": task.id, "message_id": data["message_id"]}, status=status.HTTP_202_ACCEPTED)
