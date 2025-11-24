from django.urls import path

from .views import ConstituencyGeoJSONView

urlpatterns = [
    path('constituencies/', ConstituencyGeoJSONView.as_view(), name='constituency-geojson'),
]
