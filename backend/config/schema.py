"""Schema support for serializer-based APIViews and versioned JWT auth.

APIView methods already name their serializers explicitly. Inspect only their
source, never execute handlers or database queries during schema generation.
Manual dictionary endpoints retain an honest free-form JSON schema.
"""
import ast
import inspect
import textwrap

from drf_spectacular.extensions import OpenApiAuthenticationExtension
from drf_spectacular.openapi import AutoSchema
from drf_spectacular.types import OpenApiTypes
from rest_framework.serializers import BaseSerializer


class VersionedJWTAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "accounts.authentication.VersionedJWTAuthentication"
    name = "BearerJWT"

    def get_security_definition(self, auto_schema):
        return {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}


class MarketplaceSchema(AutoSchema):
    def _method_serializer(self, *, request):
        handler = getattr(self.view, self.method.lower(), None)
        try:
            tree = ast.parse(textwrap.dedent(inspect.getsource(handler)))
        except (OSError, TypeError, SyntaxError):
            return OpenApiTypes.OBJECT
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Name):
                continue
            candidate = handler.__globals__.get(node.func.id)
            if not inspect.isclass(candidate) or not issubclass(candidate, BaseSerializer):
                continue
            is_request = any(keyword.arg == "data" for keyword in node.keywords)
            if is_request != request:
                continue
            many = any(keyword.arg == "many" and isinstance(keyword.value, ast.Constant)
                       and keyword.value.value is True for keyword in node.keywords)
            return candidate(many=many)
        return OpenApiTypes.OBJECT

    def get_request_serializer(self):
        if getattr(self.view, "serializer_class", None):
            return super().get_request_serializer()
        return self._method_serializer(request=True)

    def get_response_serializers(self):
        if getattr(self.view, "serializer_class", None):
            return super().get_response_serializers()
        return self._method_serializer(request=False)


class CatalogApiKeyAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "accounts.authentication.CatalogApiKeyAuthentication"
    name = "CatalogApiKey"

    def get_security_definition(self, auto_schema):
        return {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "Api-Key <key>",
        }
