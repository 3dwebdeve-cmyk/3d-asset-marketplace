from rest_framework import serializers


class ContactSubmissionSerializer(serializers.Serializer):
    name = serializers.CharField(min_length=2, max_length=120)
    email = serializers.EmailField(max_length=254)
    subject = serializers.CharField(min_length=3, max_length=200)
    message = serializers.CharField(min_length=10, max_length=5000)
    attachments = serializers.ListField(
        child=serializers.FileField(), required=False, max_length=10,
    )

    def validate_attachments(self, files):
        from pathlib import Path
        allowed = {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.obj', '.fbx', '.glb', '.gltf', '.blend', '.stl', '.step', '.stp', '.iges', '.igs', '.zip'}
        if sum(file.size for file in files) > 10 * 1024 * 1024:
            raise serializers.ValidationError('Reference files must total no more than 10 MB.')
        if any(Path(file.name).suffix.lower() not in allowed for file in files):
            raise serializers.ValidationError('Choose images, PDF, CAD, 3D or ZIP files.')
        return files

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
