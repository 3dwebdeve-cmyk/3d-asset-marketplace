"""Why the catalog import refused a model, in words, with what to do next.

The one table of import reasons (docs/PACKAGES_PIPELINE.md, step 2.9). The admin Imports panel
reads it through the uploader-imports API, so the codes and their texts live only here.
"""

from __future__ import annotations

# code: (what happened, what to do)
IMPORT_REASONS: dict[str, tuple[str, str]] = {
    # The sheet and the Model ID
    "folder_mismatch": ("The uploader could not match the model folder.", "Check the folder name against the sheet, then upload again."),
    "invalid_model_id": ("The Model ID is not valid (it must start with a 2-5 letter category code, for example ELE-000001).", "Fix the Model ID in the sheet, then upload again."),
    "invalid_name": ("The name is shorter than 2 characters.", "Fix the name in the sheet, then upload again."),
    "invalid_currency": ("The currency is not supported (USD only).", "Set the currency to USD, then upload again."),
    "qa_not_ready": ('The QA status in the uploader is not "Ready for QA".', "Finish the model's checks in the uploader, then upload again."),
    "exports_incomplete": ("The package holds no model format besides GLB.", "Export the model formats, then upload again."),
    "invalid_export_size": ("An export reports a size of 0.", "Export the model again, then upload again."),
    "published_sku": ("This Model ID belongs to a model the import cannot update.", "Check the Model ID in the sheet."),
    # Files and keys
    "invalid_r2_prefix": ("The files are not under models/<ID>/ or free-models/<ID>/.", "Upload the model again with the uploader."),
    "invalid_object_key": ("A file name the website does not know (the uploader is out of date).", "Update the Model Uploader, then upload again."),
    "invalid_packages": ("The package list is wrong: each zip must be <ID>_<package>.zip, one per package, and the main zip must be one of them.", "Upload the model again with the current uploader."),
    "missing_package_object": ("A package zip is not in storage.", "Upload the model again."),
    "package_has_buyers": ("A package someone bought is missing from this upload, and buyers must keep their file.", "Keep that package's zip in the model folder, then upload again."),
    "missing_thumbnail": ("No thumbnail was sent.", "Add the thumbnail, then upload again."),
    "missing_thumbnail_object": ("The thumbnail is not in storage.", "Upload the model again."),
    "invalid_thumbnail": ("The thumbnail is not a valid image (JPEG, PNG or WebP, at most 25 MB and 20 megapixels).", "Replace the thumbnail, then upload again."),
    "missing_gallery_object": ("A gallery image is not in storage.", "Upload the model again."),
    "invalid_gallery_image": ("A gallery image is not a valid image (JPEG, PNG or WebP, at most 25 MB and 20 megapixels).", "Replace the image, then upload again."),
    "image_unreadable": ("Storage could not be read.", "Upload again in a few minutes."),
    # Preview and 360°
    "missing_glb_checksum": ("A preview GLB was sent without its checksum.", "Upload the model again with the uploader."),
    "invalid_preview_format": ("The preview is not a .glb file.", "Export the preview as GLB, then upload again."),
    "missing_preview_object": ("The preview GLB is not in storage.", "Upload the model again."),
    "invalid_preview": ("The preview GLB is not a valid GLB file.", "Export the preview again, then upload again."),
    "preview_too_large": ("The preview GLB is larger than 12 MB.", "Reduce the preview, then upload again."),
    "preview_not_reduced": ("The preview GLB has more than half the model's polygons.", "Reduce the preview, then upload again."),
    "preview_unreadable": ("Storage could not be read.", "Upload again in a few minutes."),
    "preview_malware": ("The virus scanner found malware in the preview; the file was deleted.", "Check the PC that made the file, then upload a clean preview."),
    "scanner_unavailable": ("The virus scanner is not running.", "Ask the administrator to check the scanner, then upload again."),
    "invalid_spin_keys": ("The 360° frame list is wrong: it needs exactly 36 frames named 360_<ID>_01 to _36.", "Render the 360° again, then upload again."),
    "missing_spin_object": ("A 360° frame is not in storage.", "Upload the model again."),
    "invalid_spin_image": ("A 360° frame is not a valid image.", "Render the 360° again, then upload again."),
    # Category (taken from the code in the Model ID)
    "category_unmapped": ("No category has the code of this ID, and the sheet has no usable category name.", "Set the code on the right category in /console > Categories, or fill the Category column, then upload again."),
    "category_code_mismatch": ("The sheet's category already has another code.", "Check the Model ID and the Category column; or set the right code in /console > Categories."),
    "category_ambiguous": ("Several categories have the sheet's category name and none has a code.", "Set the code on the right one in /console > Categories, then upload again."),
    "category_inactive": ("The category for this code is switched off in /console.", "Switch the category on in /console > Categories, then upload again."),
    "category_rejected": ("An administrator rejected the new category for this code.", "Approve the category, or merge it into another one, in /console > Categories; then upload again."),
    # Plugins (the Plugin Uploader sends them on the same import, with product_type "plugin")
    "invalid_product_type": ("The item's product type is not one the website knows (model or plugin).", "Update the uploader, then upload again."),
    "invalid_plugin_id": ("The Plugin ID is not valid (it must look like PLUG-MAX-000001 or PLG-MAX-000001).", "Fix the Plugin ID, then upload again."),
    "missing_description": ("The plugin has no description.", "Add the description in the sheet, then upload again."),
    "invalid_manifest": ("The plugin's manifest is not valid or is too large.", "Upload the plugin again with the uploader."),
    "unknown_category": ("No active plugin category has the code in this Plugin ID.", "Add the code to the right plugin category in /console, or switch it on, then upload again."),
    "category_mismatch": ("The plugin's category code does not match its Plugin ID.", "Check the Plugin ID and its category, then upload again."),
    "plugin_id_in_use": ("This Plugin ID already belongs to another plugin.", "Check the Plugin ID in the sheet."),
    "live_free_change": ("This plugin is on sale and the upload would move it between free and paid.", "Set the plugin to Draft in /console first, then upload again."),
    "import_error": ("The website hit an unexpected error with this plugin.", "Upload again; if it happens again, send the Plugin ID to the developer."),
    # Unexpected
    "internal_error": ("The website hit an unexpected error with this model.", "Upload again; if it happens again, send the Model ID to the developer."),
    "product_error": ("The website could not save this model.", "Upload again; if it happens again, send the Model ID to the developer."),
}


def describe_reason(code: str) -> dict[str, str]:
    """The reason in words; an unknown code is shown as it is."""
    text, action = IMPORT_REASONS.get(code, (code, ""))
    return {"reason": code, "text": text, "action": action}
