"""Serializers for Step 3 structured extraction."""
from rest_framework import serializers

from orbit_app.classifications.services import VALID_CATEGORIES, VALID_PRIORITIES


class ActionItemSerializer(serializers.Serializer):
    task = serializers.CharField()
    owner = serializers.CharField(required=False, allow_null=True, default=None)
    deadline = serializers.CharField(required=False, allow_null=True, default=None)
    priority = serializers.ChoiceField(choices=VALID_PRIORITIES, default="medium")


class ExtractionResultSerializer(serializers.Serializer):
    topic = serializers.CharField()
    category = serializers.ChoiceField(choices=VALID_CATEGORIES)
    summary = serializers.CharField(allow_blank=True)
    decisions = serializers.ListField(child=serializers.CharField(), default=list)
    action_items = ActionItemSerializer(many=True, default=list)


class ExtractionRequestSerializer(serializers.Serializer):
    message_id = serializers.IntegerField()
    text = serializers.CharField(required=False, allow_blank=True, default=None)
    context_metadata = serializers.DictField(required=False, default=dict)
