from rest_framework import status as http
from rest_framework.views import exception_handler

from .responses import error


def api_exception_handler(exc, context):
    """Render every DRF error (auth, validation, 404, ...) in the standard error envelope."""
    response = exception_handler(exc, context)
    if response is None:
        return None
    data = response.data
    if isinstance(data, dict) and set(data) == {'detail'}:
        return error(str(data['detail']), status=response.status_code)
    if response.status_code == http.HTTP_400_BAD_REQUEST:
        return error('Validation failed.', status=response.status_code, errors=data)
    return error('Request failed.', status=response.status_code, errors=data)
