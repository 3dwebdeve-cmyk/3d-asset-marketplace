from rest_framework import serializers


class ContactSubmissionSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=2, max_length=120)
    email = serializers.EmailField(max_length=254)
    subject = serializers.CharField(min_length=3, max_length=200)
    message = serializers.CharField(min_length=10, max_length=5000)
    # Honeypot: bots fill this; humans leave it empty. Must be blank if provided.
    website = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=200,
        write_only=True,
    )

    def validate_website(self, value: str) -> str:
        if value and value.strip():
            # Mark as honeypot hit without rejecting at serializer level —
            # the view/service silently discards to avoid tipping off bots.
            self.context["honeypot_triggered"] = True
        return value
