"""Step 5: DRF serializers for the chat copilot API gateway."""
from rest_framework import serializers

TRUST_STATUSES = ("verified", "low_confidence", "unknown")


class ChatRequestSerializer(serializers.Serializer):
    """Inbound chat payload. Accepts ``message`` (canonical) or ``query`` alias."""
    message = serializers.CharField(required=False, allow_blank=False)
    query = serializers.CharField(required=False, allow_blank=False)
    top_k = serializers.IntegerField(required=False, default=5, min_value=1, max_value=50)
    alpha = serializers.FloatField(required=False, default=0.5, min_value=0.0, max_value=1.0)
    stream = serializers.BooleanField(required=False, default=False)
    context_filter = serializers.DictField(required=False, default=dict, allow_empty=True)

    def validate(self, attrs):
        query = (attrs.get("message") or attrs.get("query") or "").strip()
        if not query:
            raise serializers.ValidationError({"message": "This field is required (or pass 'query')."})
        attrs["query"] = query
        context_filter = attrs.get("context_filter") or {}
        if not isinstance(context_filter, dict):
            raise serializers.ValidationError({"context_filter": "Must be an object."})
        attrs["context_filter"] = context_filter
        return attrs


class CitationSerializer(serializers.Serializer):
    message_id = serializers.IntegerField(allow_null=True)
    text = serializers.CharField()
    source_type = serializers.CharField()


class ActionItemPayloadSerializer(serializers.Serializer):
    task = serializers.CharField(required=False, default="")
    description = serializers.CharField(required=False, default="", allow_blank=True)
    owner = serializers.CharField(required=False, allow_null=True, default=None)
    deadline = serializers.CharField(required=False, allow_null=True, default=None)
    priority = serializers.CharField(required=False, default="medium")


class ContradictionPayloadSerializer(serializers.Serializer):
    topic_id = serializers.IntegerField(required=False, allow_null=True, default=None)
    topic_label = serializers.CharField(required=False, allow_null=True, default=None)
    past_snapshot = serializers.CharField(required=False, default="", allow_blank=True)
    past_timestamp = serializers.CharField(required=False, default="", allow_blank=True)
    reason = serializers.CharField(required=False, default="", allow_blank=True)


class RetrievalMetaSerializer(serializers.Serializer):
    top_k = serializers.IntegerField()
    alpha = serializers.FloatField()
    hits = serializers.IntegerField()
    latency_ms = serializers.FloatField()
    backend = serializers.CharField()
    retrieval = serializers.CharField()


class ChatResponseSerializer(serializers.Serializer):
    answer = serializers.CharField(allow_blank=True)
    trust_status = serializers.ChoiceField(choices=TRUST_STATUSES)
    confidence = serializers.FloatField()
    citations = CitationSerializer(many=True)
    action_items = ActionItemPayloadSerializer(many=True)
    contradictions = ContradictionPayloadSerializer(many=True)
    retrieval_meta = RetrievalMetaSerializer()
