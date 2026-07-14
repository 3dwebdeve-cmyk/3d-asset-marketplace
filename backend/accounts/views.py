from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.serializers import (
    LoginSerializer,
    RegisterSerializer,
    UserResponseSerializer,
)
from accounts.services import AuthenticationError, AuthenticationService, LoginData


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        response_serializer = UserResponseSerializer(user)
        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        credentials = LoginData(
            email=serializer.validated_data["email"],
            password=serializer.validated_data["password"],
        )

        try:
            user = AuthenticationService.authenticate_user(credentials)
        except AuthenticationError as exc:
            raise AuthenticationFailed(exc.message) from exc

        tokens = AuthenticationService.build_tokens(user)
        payload = {
            **tokens,
            "user": UserResponseSerializer(user).data,
        }
        return Response(payload, status=status.HTTP_200_OK)
