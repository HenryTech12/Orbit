from django.urls import path

from . import views

urlpatterns = [
    path('topics/', views.TopicListView.as_view()),
    path('topics/<str:topic_id>/', views.TopicDetailView.as_view()),
    path('topics/<str:topic_id>/history/', views.TopicHistoryView.as_view()),
    path('topics/<str:topic_id>/changes/', views.TopicChangesView.as_view()),
    path('meetings/', views.MeetingListView.as_view()),
    path('meetings/<str:meeting_id>/', views.MeetingDetailView.as_view()),
    path('meetings/<str:meeting_id>/process/', views.MeetingProcessView.as_view()),
    path('meeting-links/detect/', views.MeetingLinkDetectView.as_view()),
    path('meeting-links/detections/', views.MeetingLinkDetectionListView.as_view()),
    path('meeting-links/reminders/due/', views.DueRemindersView.as_view()),
    path('meeting-links/reminders/<str:reminder_id>/sent/', views.ReminderSentView.as_view()),
    path('vectors/search/', views.VectorSearchView.as_view()),
]
