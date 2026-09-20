from rest_framework import status as http
from rest_framework.response import Response


def success(data=None, message='OK', status=http.HTTP_200_OK):
    """Standard success envelope: {"status": 200, "message": "...", "data": ...}."""
    return Response({'status': status, 'message': message, 'data': data}, status=status)


def error(message, status=http.HTTP_400_BAD_REQUEST, errors=None):
    """Standard error envelope: {"status": 4xx/5xx, "message": "...", "errors": ...}."""
    return Response({'status': status, 'message': message, 'errors': errors}, status=status)
