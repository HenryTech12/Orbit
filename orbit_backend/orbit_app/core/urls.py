"""Step 5: core URL routes (health + chat copilot)."""
from django.urls import path

from orbit_app.core import views

urlpatterns = [
    path("health/", views.health_check, name="health-check"),
    path("v1/chat/", views.ChatCopilotView.as_view(), name="chat-copilot"),
    path("v1/chat", views.ChatCopilotView.as_view(), name="chat-copilot-noslash"),
    path("copilot/ask/", views.ChatCopilotView.as_view(), name="copilot-ask"),
    path("copilot/ask", views.ChatCopilotView.as_view(), name="copilot-ask-noslash"),
]
