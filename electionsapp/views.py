from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Constituency
from .serializers import ConstituencySerializer


class ConstituencyGeoJSONView(APIView):
    """Return all constituencies as a GeoJSON FeatureCollection."""

    def get(self, request):
        queryset = Constituency.objects.all().order_by('name')
        serializer = ConstituencySerializer(queryset, many=True)

        features = []
        for entry in serializer.data:
            entry_data = dict(entry)
            geometry = entry_data.pop('geometry', None)
            features.append(
                {
                    'type': 'Feature',
                    'id': entry_data['id'],
                    'properties': entry_data,
                    'geometry': geometry,
                }
            )

        return Response({
            'type': 'FeatureCollection',
            'features': features,
        })
