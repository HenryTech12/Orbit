"""
URL configuration for orbit_app project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.1/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import include, path

from orbit_app.core.views import ChatCopilotView

views_chat_copilot = ChatCopilotView.as_view()
views_chat_copilot_noslash = ChatCopilotView.as_view()

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('orbit_app.core.urls')),
    # Standalone alias so POST /copilot/ask works with or without /api prefix.
    path('copilot/ask/', views_chat_copilot, name='copilot-ask-root'),
    path('copilot/ask', views_chat_copilot_noslash, name='copilot-ask-root-noslash'),
]
