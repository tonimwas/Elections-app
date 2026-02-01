import json
from django.contrib.gis.db.models.functions import AsGeoJSON
from django.utils.decorators import method_decorator
from django.views.decorators.cache import cache_page
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Constituency


@method_decorator(cache_page(60 * 5), name='dispatch')
class ConstituencyGeoJSONView(APIView):
    """Return all constituencies as a GeoJSON FeatureCollection."""

    def get(self, request):
        queryset = (
            Constituency.objects.all()
            .order_by('name')
            .annotate(geometry=AsGeoJSON('geom'))
            .values(
                'id',
                'name',
                'updated_name',
                'mp',
                'party',
                'impeachment_vote',
                'budget_vote',
                'county',
                'registered_voters',
                'geometry',
            )
        )

        features = []
        for entry in queryset:
            entry_data = dict(entry)
            geometry = entry_data.pop('geometry', None)
            features.append(
                {
                    'type': 'Feature',
                    'id': entry_data['id'],
                    'properties': entry_data,
                    'geometry': json.loads(geometry) if geometry else None,
                }
            )

        return Response(
            {
                'type': 'FeatureCollection',
                'features': features,
            }
        )
