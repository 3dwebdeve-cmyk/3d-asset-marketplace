from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.throttles import ContactFormRateThrottle
from contact.serializers import ContactSubmissionSerializer
from contact.services import ContactService, ContactSubmissionData


class ContactSubmissionView(APIView):
    permission_classes = [AllowAny]
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
            ),
            honeypot_triggered=honeypot_triggered,
        )
        return Response({"detail": detail}, status=status.HTTP_200_OK)
