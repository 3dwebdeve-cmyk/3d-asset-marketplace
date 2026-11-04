from django.urls import path

from plugins.ingest_views import PluginIngestImportView, PluginIngestNextIdsView

app_name = "plugin_ingest"

urlpatterns = [
    path("import/", PluginIngestImportView.as_view(), name="import"),
    path("next-ids/", PluginIngestNextIdsView.as_view(), name="next-ids"),
]
