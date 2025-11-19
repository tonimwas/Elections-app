from django.contrib import admin
from django.utils.html import format_html
from django.db.models import Count, Avg
from .models import Constituency
from django.urls import path
from django.http import HttpResponse
from django.core.serializers import serialize
from django.template.response import TemplateResponse
from django.utils.safestring import mark_safe
from django.template.loader import render_to_string

import json

class ConstituencyAdmin(admin.ModelAdmin):
    list_display = ('name', 'mp', 'party', 'impeachment_vote', 'budget_vote')
    search_fields = ('name', 'mp', 'party', 'impeachment_vote', 'budget_vote')
    list_filter = ('county', 'party', 'impeachment_vote', 'budget_vote')
    list_select_related = True
    
    # Geometry field configuration
    readonly_fields = ('geometry_display',)
    
    fieldsets = (
        (None, {
            'fields': ('name', 'mp', 'party', 'impeachment_vote', 'county', 'budget_vote')
        }),
        ('Geometry', {
            'fields': ('geometry_display',)
        }),
    )
    
    def geometry_display(self, obj):
        """Display geometry as a map and raw text"""
        if not obj or not obj.geom:
            return "No geometry available"
        
        # Include the map template
        context = {'geom': obj.geom}
        return render_to_string('leaflet/admin/widget.html', context)
    
    geometry_display.short_description = "Geometry"
    geometry_display.allow_tags = True
    
    # ----- Custom admin views: map of all wards and GeoJSON feed -----
    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('map/', self.admin_site.admin_view(self.map_view), name='mwas_ward_map'),
            path('geojson/', self.admin_site.admin_view(self.geojson_view), name='mwas_ward_geojson'),
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
            'geojson', qs,
            geometry_field='geom',
            fields=('name', 'county',   'party', 'impeachment_vote', 'budget_vote')
        )
        return HttpResponse(data, content_type='application/json')

admin.site.register(Constituency, ConstituencyAdmin)