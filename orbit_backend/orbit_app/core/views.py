from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

from .responses import success


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return success({'healthy': True}, 'Service is healthy.')
