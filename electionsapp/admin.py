from django.contrib import admin
from django.urls import path
from django.http import HttpResponse
from django.core.serializers import serialize
from django.template.response import TemplateResponse
from leaflet.admin import LeafletGeoAdmin

from .models import Constituency


class ConstituencyAdmin(LeafletGeoAdmin):
    list_display = ('name', 'mp', 'party', 'impeachment_vote', 'budget_vote')
    search_fields = ('name', 'mp', 'county', 'party')
    list_filter = ('county', 'party', 'impeachment_vote', 'budget_vote')
    list_select_related = True

    map_template = 'leaflet/admin/widget.html'
    map_width = '100%'
    map_height = '600px'
    display_raw = True
    modifiable = False
    settings_overrides = {
        'DEFAULT_CENTER': (0.5, 37.0),
        'DEFAULT_ZOOM': 7,
        'MIN_ZOOM': 7,
        'MAX_ZOOM': 18,
        'SCALE': 'both',
        'ATTRIBUTION_PREFIX': 'Constituency Boundaries',
        'TILES': [(
            'OpenStreetMap',
            'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            {'attribution': '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}
        )],
    }

    readonly_fields = ()

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if 'geom' in form.base_fields:
            widget = form.base_fields['geom'].widget
            widget.map_width = '100%'
            widget.map_height = '600px'
            widget.template_name = 'leaflet/admin/widget.html'
            widget.supports_3d = True
            widget.map_srid = 4326
            widget.modifiable = False
            widget.map_style = {
                'color': '#FF5722',
                'weight': 3,
                'fillColor': '#FF9800',
                'fillOpacity': 0.3,
            }
        return form

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('map/', self.admin_site.admin_view(self.map_view), name='electionsapp_constituency_map'),
            path('geojson/', self.admin_site.admin_view(self.geojson_view), name='electionsapp_constituency_geojson'),
        ]
        return custom_urls + urls

    def map_view(self, request):
        context = dict(
            self.admin_site.each_context(request),
            title='Constituencies Map',
        )
        return TemplateResponse(request, 'admin/electionsapp/constituency/map.html', context)

    def geojson_view(self, request):
        qs = Constituency.objects.all()
        data = serialize(
            'geojson',
            qs,
            geometry_field='geom',
            fields=('name', 'county', 'mp', 'party', 'impeachment_vote', 'budget_vote')
        )
        return HttpResponse(data, content_type='application/json')


admin.site.register(Constituency, ConstituencyAdmin)