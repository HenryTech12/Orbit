"""Serializers for the chunks app."""
from rest_framework import serializers


class ChunkSerializer(serializers.Serializer):
    chunk_id = serializers.IntegerField(read_only=True)
    message_id = serializers.IntegerField(read_only=True)
    text = serializers.CharField()
    embedding = serializers.ListField(child=serializers.FloatField(), required=False, allow_null=True)
    token_start = serializers.IntegerField()
    token_end = serializers.IntegerField()


class IngestChunksSerializer(serializers.Serializer):
    message_id = serializers.IntegerField()
    text = serializers.CharField(required=False, allow_blank=True, default=None)
    chunk_size = serializers.IntegerField(required=False, default=512, min_value=1)
    chunk_overlap = serializers.IntegerField(required=False, default=64, min_value=0)

    def validate(self, attrs):
        if attrs.get("chunk_overlap", 64) >= attrs.get("chunk_size", 512):
            raise serializers.ValidationError("chunk_overlap must be smaller than chunk_size.")
        return attrs
