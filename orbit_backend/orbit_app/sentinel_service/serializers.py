from rest_framework import serializers

PLATFORMS = ['zoom', 'teams', 'google_meet', 'other']
SOURCE_TYPES = ['whatsapp', 'meeting_transcript', 'pdf']
AUTHORITY_LEVELS = ['official', 'general']


class TopicCreateSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=255)


class TopicHistorySerializer(serializers.Serializer):
    source_type = serializers.ChoiceField(choices=SOURCE_TYPES)
    source_id = serializers.CharField()
    value_snapshot = serializers.CharField()
    authority_level = serializers.ChoiceField(choices=AUTHORITY_LEVELS)
    timestamp = serializers.DateTimeField(required=False)


class MeetingCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    platform = serializers.ChoiceField(choices=PLATFORMS)
    scheduled_time = serializers.DateTimeField(required=False, allow_null=True)
    recording_url = serializers.URLField(required=False, allow_null=True)
    transcript_text = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        if not attrs.get('recording_url') and not attrs.get('transcript_text'):
            raise serializers.ValidationError('Provide recording_url or transcript_text.')
        return attrs


class MeetingLinkDetectSerializer(serializers.Serializer):
    message = serializers.CharField()
    reference_time = serializers.DateTimeField(required=False, allow_null=True)


class VectorSearchSerializer(serializers.Serializer):
    query = serializers.CharField()
    top_k = serializers.IntegerField(min_value=1, max_value=50, default=5)
