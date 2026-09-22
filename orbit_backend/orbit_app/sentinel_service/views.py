from rest_framework import status
from rest_framework.views import APIView

from orbit_app.core.responses import error, success

from .serializers import (
    MeetingCreateSerializer,
    MeetingLinkDetectSerializer,
    TopicCreateSerializer,
    TopicHistorySerializer,
    VectorSearchSerializer,
)
from .services import SentinelError, get_sentinel_client


class SentinelView(APIView):
    """Base view: calls sentinel-backend-service and maps its failures to API responses. """

    def handle_exception(self, exc):
        if isinstance(exc, SentinelError):
            # Pass its 4xx (e.g. 409 duplicate topic) through; anything else is a bad gateway.
            code = exc.status_code if exc.status_code and 400 <= exc.status_code < 500 else 502
            return error(str(exc), status=code)
        return super().handle_exception(exc)

    @staticmethod
    def payload(serializer_class, request):
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        return {k: (v.isoformat() if hasattr(v, 'isoformat') else v) for k, v in serializer.validated_data.items()}


class TopicListView(SentinelView):
    def get(self, request):
        return success(get_sentinel_client().list_topics(), 'Topics retrieved.')

    def post(self, request):
        data = self.payload(TopicCreateSerializer, request)
        return success(get_sentinel_client().create_topic(**data), 'Topic created.', status.HTTP_201_CREATED)


class TopicDetailView(SentinelView):
    def get(self, request, topic_id):
        return success(get_sentinel_client().get_topic(topic_id), 'Topic retrieved.')


class TopicHistoryView(SentinelView):
    def post(self, request, topic_id):
        data = self.payload(TopicHistorySerializer, request)
        data.setdefault('timestamp', None)
        return success(get_sentinel_client().add_topic_history(topic_id, **data), 'Topic history entry added.', status.HTTP_201_CREATED)


class TopicChangesView(SentinelView):
    def get(self, request, topic_id):
        return success(get_sentinel_client().topic_changes(topic_id), 'Topic changes retrieved.')


class MeetingListView(SentinelView):
    def get(self, request):
        return success(get_sentinel_client().list_meetings(), 'Meetings retrieved.')

    def post(self, request):
        data = self.payload(MeetingCreateSerializer, request)
        return success(get_sentinel_client().create_meeting(**data), 'Meeting created.', status.HTTP_201_CREATED)


class MeetingDetailView(SentinelView):
    def get(self, request, meeting_id):
        return success(get_sentinel_client().get_meeting(meeting_id), 'Meeting retrieved.')


class MeetingProcessView(SentinelView):
    # Synchronous for now; move to a Celery task once the flow is settled.
    def post(self, request, meeting_id):
        return success(get_sentinel_client().process_meeting(meeting_id), 'Meeting processed.')


class MeetingLinkDetectView(SentinelView):
    def post(self, request):
        data = self.payload(MeetingLinkDetectSerializer, request)
        data.setdefault('reference_time', None)
        return success(get_sentinel_client().detect_meeting_link(**data), 'Meeting link detection completed.', status.HTTP_201_CREATED)


class MeetingLinkDetectionListView(SentinelView):
    def get(self, request):
        return success(get_sentinel_client().list_detections(), 'Meeting link detections retrieved.')


class DueRemindersView(SentinelView):
    def get(self, request):
        return success(get_sentinel_client().due_reminders(), 'Due reminders retrieved.')


class ReminderSentView(SentinelView):
    def post(self, request, reminder_id):
        return success(get_sentinel_client().mark_reminder_sent(reminder_id), 'Reminder marked as sent.')


class VectorSearchView(SentinelView):
    def post(self, request):
        data = self.payload(VectorSearchSerializer, request)
        return success(get_sentinel_client().vector_search(**data), 'Vector search completed.')
