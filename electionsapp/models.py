from django.db import models
from django.utils import timezone
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
import os

# Create your models here.


class Constituency(models.Model):
    """Model to store constituencies with shapefile geometry."""
    name = models.CharField(max_length=255)
    mp = models.CharField(max_length=255)
    party = models.CharField(max_length=255)
    impeachment_vote = models.CharField(max_length=255)
    county = models.CharField(max_length=255)
    budget_vote = models.CharField(max_length=255)
    # store WKT or GeoJSON string representation of the geometry (temporary solution)
    geom = models.TextField(help_text="Geographic boundary of the ward (WKT/GeoJSON format)", null=True, blank=True)

    def __str__(self):
        return self.name

