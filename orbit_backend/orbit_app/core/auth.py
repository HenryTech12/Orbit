import secrets

from django.conf import settings
from rest_framework import authentication, exceptions


class ApiKeyUser:
    """Minimal stand-in user for requests authenticated with an API key."""

    is_authenticated = True
    is_anonymous = False
    pk = None

    def __str__(self):
        return 'api-key-client'


class ApiKeyAuthentication(authentication.BaseAuthentication):
    """Accepts `Authorization: Bearer <key>` or `X-API-Key: <key>`.

    Keys come from ORBIT_API_KEYS. With no keys configured every key is
    rejected (fail closed). Requests with no key fall through to the next
    authenticator (e.g. session auth for the admin).
    """

    def authenticate(self, request):
        header = request.headers.get('Authorization', '')
        key = request.headers.get('X-API-Key', '')
        if header.lower().startswith('bearer '):
            key = header[7:].strip()
        if not key:
            return None
        if not any(secrets.compare_digest(key, valid) for valid in settings.ORBIT_API_KEYS):
            raise exceptions.AuthenticationFailed('Invalid API key.')
        return (ApiKeyUser(), None)

    def authenticate_header(self, request):
        return 'Bearer'
