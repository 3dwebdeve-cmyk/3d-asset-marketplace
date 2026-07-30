"""
URL configuration for config project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.conf import settings
from django.contrib import admin
from django.urls import include, path

from config.media import serve_public_media

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('accounts.urls')),
    path('api/categories/', include('categories.urls')),
    path('api/admin/categories/', include('categories.admin_urls')),
    path('api/products/', include('products.urls')),
    path('api/admin/products/', include('products.admin_urls')),
    path('api/plugins/', include('plugins.urls')),
    path('api/plugin-categories/', include('plugins.category_urls')),
    path('api/admin/plugins/', include('plugins.admin_urls')),
    path('api/admin/plugin-categories/', include('plugins.admin_category_urls')),
    path('api/custom-projects/', include('custom_projects.urls')),
    path('api/admin/custom-projects/', include('custom_projects.admin_urls')),
    path('api/orders/', include('orders.urls')),
    path('api/admin/orders/', include('orders.admin_urls')),
    path('api/admin/dashboard/', include('analytics.admin_urls')),
    path('api/wishlist/', include('wishlist.urls')),
    path('api/cart/', include('cart.urls')),
    path('api/reviews/', include('reviews.urls')),
    path('api/admin/reviews/', include('reviews.admin_urls')),
    path('api/downloads/', include('downloads.urls')),
    path('api/admin/downloads/', include('downloads.admin_urls')),
]

# DEBUG only: serve public media prefixes. Private packages/references use
# authenticated download endpoints (see config.media.PUBLIC_MEDIA_PREFIXES).
if settings.DEBUG:
    urlpatterns += [
        path("media/<path:path>", serve_public_media, name="serve-public-media"),
    ]
