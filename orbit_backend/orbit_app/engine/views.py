from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    MeetingCreateSerializer,
    MeetingLinkDetectSerializer,
    TopicCreateSerializer,
    TopicHistorySerializer,
    VectorSearchSerializer,
)
from .services import EngineError, get_engine_client


class EngineView(APIView):
    """Base view: calls the engine and maps engine failures to API responses. """

    def handle_exception(self, exc):
        if isinstance(exc, EngineError):
            # Pass engine 4xx (e.g. 409 duplicate topic) through; anything else is a bad gateway.
            code = exc.status_code if exc.status_code and 400 <= exc.status_code < 500 else 502
            return Response({'detail': str(exc)}, status=code)
        return super().handle_exception(exc)

    @staticmethod
    def payload(serializer_class, request):
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return {k: (v.isoformat() if hasattr(v, 'isoformat') else v) for k, v in serializer.validated_data.items()}


class TopicListView(EngineView):
    def get(self, request):
        return Response(get_engine_client().list_topics())

    def post(self, request):
        data = self.payload(TopicCreateSerializer, request)
        return Response(get_engine_client().create_topic(**data), status=status.HTTP_201_CREATED)


class TopicDetailView(EngineView):
    def get(self, request, topic_id):
        return Response(get_engine_client().get_topic(topic_id))


class TopicHistoryView(EngineView):
    def post(self, request, topic_id):
        data = self.payload(TopicHistorySerializer, request)
        data.setdefault('timestamp', None)
        return Response(get_engine_client().add_topic_history(topic_id, **data), status=status.HTTP_201_CREATED)


class TopicChangesView(EngineView):
    def get(self, request, topic_id):
        return Response(get_engine_client().topic_changes(topic_id))


class MeetingListView(EngineView):
    def get(self, request):
        return Response(get_engine_client().list_meetings())

    def post(self, request):
        data = self.payload(MeetingCreateSerializer, request)
        return Response(get_engine_client().create_meeting(**data), status=status.HTTP_201_CREATED)


class MeetingDetailView(EngineView):
    def get(self, request, meeting_id):
        return Response(get_engine_client().get_meeting(meeting_id))


class MeetingProcessView(EngineView):
    # Synchronous for now; move to a Celery task once the flow is settled.
    def post(self, request, meeting_id):
        return Response(get_engine_client().process_meeting(meeting_id))


class MeetingLinkDetectView(EngineView):
    def post(self, request):
        data = self.payload(MeetingLinkDetectSerializer, request)
        data.setdefault('reference_time', None)
        return Response(get_engine_client().detect_meeting_link(**data), status=status.HTTP_201_CREATED)


class MeetingLinkDetectionListView(EngineView):
    def get(self, request):
        return Response(get_engine_client().list_detections())


class DueRemindersView(EngineView):
    def get(self, request):
        return Response(get_engine_client().due_reminders())


class ReminderSentView(EngineView):
    def post(self, request, reminder_id):
        return Response(get_engine_client().mark_reminder_sent(reminder_id))


class VectorSearchView(EngineView):
    def post(self, request):
        data = self.payload(VectorSearchSerializer, request)
        return Response(get_engine_client().vector_search(**data))
