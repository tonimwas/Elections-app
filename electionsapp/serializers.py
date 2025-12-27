import json
from rest_framework import serializers

from .models import Constituency


class ConstituencySerializer(serializers.ModelSerializer):
    geometry = serializers.SerializerMethodField()

    class Meta:
        model = Constituency
        fields = (
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

    def get_geometry(self, obj):
        if obj.geom:
            return json.loads(obj.geom.geojson)
        return None
