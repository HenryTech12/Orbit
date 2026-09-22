from unittest import mock

from django.test import SimpleTestCase, override_settings
from rest_framework.test import APIClient

from .services import SentinelError

CLIENT = 'orbit_app.sentinel_service.views.get_sentinel_client'


@override_settings(ORBIT_API_KEYS=['good-key'])
class SentinelApiTests(SimpleTestCase):
    def setUp(self):
        self.api = APIClient()

    def test_requires_key(self):
        self.assertEqual(self.api.get('/api/sentinel/topics/').status_code, 401)

    def test_rejects_wrong_key(self):
        response = self.api.get('/api/sentinel/topics/', HTTP_AUTHORIZATION='Bearer nope')
        self.assertEqual(response.status_code, 401)

    def test_no_keys_configured_fails_closed(self):
        with override_settings(ORBIT_API_KEYS=[]):
            response = self.api.get('/api/sentinel/topics/', HTTP_X_API_KEY='anything')
        self.assertEqual(response.status_code, 401)

    def test_health_stays_open(self):
        self.assertEqual(self.api.get('/api/health/').status_code, 200)

    @mock.patch(CLIENT)
    def test_bearer_and_x_api_key_both_work(self, client):
        client.return_value.list_topics.return_value = []
        self.assertEqual(self.api.get('/api/sentinel/topics/', HTTP_AUTHORIZATION='Bearer good-key').status_code, 200)
        self.assertEqual(self.api.get('/api/sentinel/topics/', HTTP_X_API_KEY='good-key').status_code, 200)

    @mock.patch(CLIENT)
    def test_duplicate_topic_passes_409_through(self, client):
        client.return_value.create_topic.side_effect = SentinelError('dup', status_code=409)
        response = self.api.post('/api/sentinel/topics/', {'label': 'x'}, format='json', HTTP_X_API_KEY='good-key')
        self.assertEqual(response.status_code, 409)

    @mock.patch(CLIENT)
    def test_service_down_is_502(self, client):
        client.return_value.list_meetings.side_effect = SentinelError('down')
        self.assertEqual(self.api.get('/api/sentinel/meetings/', HTTP_X_API_KEY='good-key').status_code, 502)

    @mock.patch(CLIENT)
    def test_meeting_needs_url_or_transcript(self, client):
        response = self.api.post('/api/sentinel/meetings/', {'title': 't', 'platform': 'zoom'}, format='json', HTTP_X_API_KEY='good-key')
        self.assertEqual(response.status_code, 400)
        client.return_value.create_meeting.assert_not_called()

    @mock.patch(CLIENT)
    def test_invalid_history_source_type(self, client):
        body = {'source_type': 'sms', 'source_id': '1', 'value_snapshot': 'v', 'authority_level': 'official'}
        response = self.api.post('/api/sentinel/topics/1/history/', body, format='json', HTTP_X_API_KEY='good-key')
        self.assertEqual(response.status_code, 400)

    def test_health_uses_envelope(self):
        body = self.api.get('/api/health/').json()
        self.assertEqual(body, {'status': 200, 'message': 'Service is healthy.', 'data': {'healthy': True}})

    def test_auth_errors_use_envelope(self):
        body = self.api.get('/api/sentinel/topics/').json()
        self.assertEqual(body['status'], 401)
        self.assertEqual(body['message'], 'Authentication credentials were not provided.')
        self.assertIsNone(body['errors'])

    @mock.patch(CLIENT)
    def test_create_topic_success_envelope(self, client):
        client.return_value.create_topic.return_value = {'id': 1, 'label': 'x'}
        response = self.api.post('/api/sentinel/topics/', {'label': 'x'}, format='json', HTTP_X_API_KEY='good-key')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json(), {'status': 201, 'message': 'Topic created.', 'data': {'id': 1, 'label': 'x'}})

    @mock.patch(CLIENT)
    def test_validation_error_envelope(self, client):
        response = self.api.post('/api/sentinel/topics/', {}, format='json', HTTP_X_API_KEY='good-key')
        body = response.json()
        self.assertEqual((response.status_code, body['status'], body['message']), (400, 400, 'Validation failed.'))
        self.assertIn('label', body['errors'])

    @mock.patch(CLIENT)
    def test_service_error_envelope(self, client):
        client.return_value.create_topic.side_effect = SentinelError('dup', status_code=409)
        body = self.api.post('/api/sentinel/topics/', {'label': 'x'}, format='json', HTTP_X_API_KEY='good-key').json()
        self.assertEqual((body['status'], body['message']), (409, 'dup'))

