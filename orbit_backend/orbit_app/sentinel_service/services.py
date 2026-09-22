import requests
from django.conf import settings
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


class SentinelError(Exception):
    """sentinel-backend-service was unreachable or returned an error."""

    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


class SentinelClient:
    """Thin client for the external meeting / contradiction / pgvector service."""

    def __init__(self, base_url=None, api_key=None, timeout=None):
        self.base_url = (base_url or settings.SENTINEL_SERVICE_URL).rstrip('/')
        self.timeout = timeout or settings.SENTINEL_SERVICE_TIMEOUT
        self.session = requests.Session()
        # Connection errors are retried for every method (nothing was sent yet);
        # 5xx responses are retried for GET only, so POSTs are never duplicated.
        retry = Retry(
            total=3,
            connect=3,
            backoff_factor=1,
            status_forcelist=(502, 503, 504),
            allowed_methods=frozenset(['GET']),
        )
        self.session.mount('https://', HTTPAdapter(max_retries=retry))
        self.session.mount('http://', HTTPAdapter(max_retries=retry))
        api_key = api_key if api_key is not None else settings.SENTINEL_SERVICE_API_KEY
        if api_key:
            self.session.headers['Authorization'] = f'Bearer {api_key}'

    def _request(self, method, path, **kwargs):
        url = f'{self.base_url}{path}'
        try:
            response = self.session.request(method, url, timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            raise SentinelError(f'{method} {path} failed: {exc}') from exc
        if not response.ok:
            raise SentinelError(
                f'{method} {path} returned {response.status_code}: {response.text[:300]}',
                status_code=response.status_code,
            )
        return response.json() if response.content else None

    # Health
    def health(self):
        return self._request('GET', '/health')

    # Meetings
    def list_meetings(self):
        return self._request('GET', '/meetings/')

    def create_meeting(self, title, platform, scheduled_time=None, recording_url=None, transcript_text=None):
        return self._request('POST', '/meetings/', json={
            'title': title,
            'platform': platform,
            'scheduled_time': scheduled_time,
            'recording_url': recording_url,
            'transcript_text': transcript_text,
        })

    def get_meeting(self, meeting_id):
        return self._request('GET', f'/meetings/{meeting_id}')

    def process_meeting(self, meeting_id):
        """Run the transcribe -> chunk -> embed -> store pipeline (slow; call from a task)."""
        return self._request('POST', f'/meetings/{meeting_id}/process')

    # Topics
    def list_topics(self):
        return self._request('GET', '/topics/')

    def create_topic(self, label):
        return self._request('POST', '/topics/', json={'label': label})

    def get_topic(self, topic_id):
        return self._request('GET', f'/topics/{topic_id}')

    def add_topic_history(self, topic_id, source_type, source_id, value_snapshot, authority_level, timestamp):
        return self._request('POST', f'/topics/{topic_id}/history', json={
            'source_type': source_type,
            'source_id': source_id,
            'value_snapshot': value_snapshot,
            'authority_level': authority_level,
            'timestamp': timestamp,
        })

    def topic_changes(self, topic_id):
        return self._request('GET', f'/topics/{topic_id}/changes')

    # Zoom / Teams links
    def detect_meeting_link(self, message, reference_time):
        return self._request('POST', '/meeting-links/detect', json={
            'message': message,
            'reference_time': reference_time,
        })

    def list_detections(self):
        return self._request('GET', '/meeting-links/detections')

    def due_reminders(self):
        return self._request('GET', '/meeting-links/reminders/due')

    def mark_reminder_sent(self, reminder_id):
        return self._request('POST', f'/meeting-links/reminders/{reminder_id}/sent')

    # Vector search
    def vector_search(self, query, top_k=5):
        return self._request('POST', '/vectors/search', json={'query': query, 'top_k': top_k})


def get_sentinel_client():
    return SentinelClient()
