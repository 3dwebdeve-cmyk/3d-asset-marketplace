from django.urls import path

from contact.views import ContactSubmissionView

app_name = "contact"

urlpatterns = [
    path("", ContactSubmissionView.as_view(), name="submit"),
]
