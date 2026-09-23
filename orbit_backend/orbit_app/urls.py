"""URL configuration for orbit_app project (unified: Sentinel proxy + Grounded Copilot)."""
from django.contrib import admin
from django.urls import include, path

from orbit_app.core.views import ChatCopilotView, HealthCheckView

views_chat_copilot = ChatCopilotView.as_view()
views_chat_copilot_noslash = ChatCopilotView.as_view()

urlpatterns = [
    # Admin
    path('admin/', admin.site.urls),
    # Health check (direct alias; also served via core urls as api/health/)
    path('api/health/', HealthCheckView.as_view(), name='health-check'),
    # Core API (health + v1/chat + copilot/ask under /api)
    path('api/', include('orbit_app.core.urls')),
    # Core v1 API routes (same core urls mounted under api/v1/ for /api/v1/* clients)
    path('api/v1/', include('orbit_app.core.urls')),
    # Sentinel service proxy (Render microservice)
    path('api/sentinel/', include('orbit_app.sentinel_service.urls')),
    # Root copilot endpoints (no /api prefix) for WhatsApp adapter
    path('copilot/ask/', views_chat_copilot, name='copilot-ask-root'),
    path('copilot/ask', views_chat_copilot_noslash, name='copilot-ask-root-noslash'),
]
