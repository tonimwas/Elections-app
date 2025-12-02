from django.db import models
from django.contrib.gis.db import models as gis_models


class Constituency(models.Model):
    """Model to store constituencies with shapefile geometry."""
    name = models.CharField(max_length=255)
    mp = models.CharField(max_length=255)
    party = models.CharField(max_length=255)
    impeachment_vote = models.CharField(max_length=255)
    county = models.CharField(max_length=255)
    budget_vote = models.CharField(max_length=255)
    registered_voters = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Total number of registered voters in the constituency",
    )
    updated_name = models.CharField(
        max_length=255,
        null=True,
        blank=True,
        help_text="Newly updated constituency name",
    )
    election_results = models.JSONField(
        default=dict,
        blank=True,
        help_text="Percentage results for 2024 election by candidate",
    )
    geom = gis_models.MultiPolygonField(
        srid=4326,
        help_text="Geographic boundary of the constituency",
        null=True,
        blank=True,
    )

    def __str__(self):
        return self.name

