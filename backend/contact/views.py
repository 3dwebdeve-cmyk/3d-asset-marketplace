import base64
import mimetypes
from pathlib import Path

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import ContactFormRateThrottle
from contact.serializers import ContactSubmissionSerializer
from contact.services import ContactService, ContactSubmissionData


class ContactSubmissionView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    throttle_classes = [ContactFormRateThrottle]

    def post(self, request: Request) -> Response:
        serializer = ContactSubmissionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        honeypot_triggered = bool(serializer.context.get("honeypot_triggered"))
        validated = serializer.validated_data
        detail = ContactService.submit(
            ContactSubmissionData(
                name=validated["name"],
                email=validated["email"],
                subject=validated["subject"],
                message=validated["message"],
                attachments=[{
                    "name": Path(file.name).name,
                    "content": base64.b64encode(file.read()).decode("ascii"),
                    "type": mimetypes.guess_type(file.name)[0] or "application/octet-stream",
                } for file in validated.get("attachments", [])],
            ),
            honeypot_triggered=honeypot_triggered,
        )
        return Response({"detail": detail}, status=status.HTTP_200_OK)
