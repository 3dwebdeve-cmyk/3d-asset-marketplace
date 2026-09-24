from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from accounts.models import ActivityLog, LegalAcceptance, Role, User, UserProfile
from accounts.services import EmailVerificationService


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ("role_name", "description", "created_at")
    search_fields = ("role_name",)


@admin.register(LegalAcceptance)
class LegalAcceptanceAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "document_key", "version", "accepted_at")
    list_filter = ("document_key", "version", "accepted_at")
    search_fields = ("user__email", "document_key", "version")
    readonly_fields = ("id", "user", "document_key", "version", "accepted_at")
    ordering = ("-accepted_at",)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


@admin.register(ActivityLog)
class ActivityLogAdmin(admin.ModelAdmin):
    list_display = ("id", "action", "actor", "target_id", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("action", "target_id", "actor__email")
    readonly_fields = (
        "id",
        "actor",
        "action",
        "target_id",
        "metadata",
        "created_at",
    )
    ordering = ("-created_at",)

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False


class UserProfileInline(admin.StackedInline):
    model = UserProfile
    extra = 0


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "full_name", "role", "email_verified", "is_active", "created_at")
    list_filter = ("role", "email_verified", "is_active", "is_staff")
    search_fields = ("email", "full_name", "google_id")
    actions = ("mark_email_verified",)
    inlines = [UserProfileInline]

    @admin.action(description="Mark selected users as email verified")
    def mark_email_verified(self, request, queryset) -> None:
        updated = 0
        for user in queryset.filter(email_verified=False, is_active=True):
            EmailVerificationService.mark_verified(user, action="admin_mark_verified")
            updated += 1
        skipped = queryset.count() - updated
        self.message_user(
            request,
            f"Marked {updated} user(s) as email verified"
            + (f" ({skipped} skipped)." if skipped else "."),
        )

    fieldsets = (
        (None, {"fields": ("email", "password", "google_id")}),
        ("Personal info", {"fields": ("full_name", "phone", "country", "avatar")}),
        ("Permissions", {"fields": ("role", "email_verified", "is_active", "is_staff", "is_superuser")}),
        ("Important dates", {"fields": ("last_login", "created_at", "updated_at")}),
    )
    readonly_fields = ("created_at", "updated_at", "last_login")

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "full_name", "password1", "password2", "role"),
            },
        ),
    )


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "company_name", "city", "country", "created_at")
    search_fields = ("user__email", "company_name", "city")
