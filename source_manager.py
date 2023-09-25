import astropy.units as u

from astroplan import Observer
from astropy.coordinates import SkyCoord, AltAz, EarthLocation, FK5
from astropy.time import Time
from astroplan.plots import plot_sky, plot_sky_24hr

import numpy as np
import csv
import configparser

import datetime
from datetime import datetime, timezone

import matplotlib.pyplot as plt

from dataclasses import dataclass


@dataclass
class AstroSource:
    source_name: str
    ra: str
    dec: str


class SourceManager:
    def __init__(self):
        self.sources = {}
        self.source_names = {}
        self.location_name = ""
        self.latitude = 0
        self.longitude = 0
        self.altitude = 0
        self.filename = ""
        self.config = configparser.ConfigParser()
        self.config_loader()
        self.read_csv()
        self.location = EarthLocation.from_geodetic(lat=self.latitude * u.deg,
                                      lon=self.longitude * u.deg,
                                      height=self.altitude * u.m)
        self.observer = Observer(location=self.location, name=self.location_name)

    def config_loader(self):
        self.config.read("location.ini")
        self.location_name = self.config["LOCATION"]["name"]
        self.latitude = self.config.getfloat("LOCATION", "latitude")
        self.longitude = self.config.getfloat("LOCATION", "longitude")
        self.altitude = self.config.getfloat("LOCATION", "altitude")

    def read_csv(self, filename="sources.csv"):
        # Open the csv, filter comments and strip spaces and tabs
        try:
            with open(filename, "r") as file:
                csvreader = csv.reader(filter(lambda row: row[0] != "#", file))
                for row in csvreader:
                    stripped_row = [cell.strip() for cell in row]
                    self.sources[stripped_row[0]] = AstroSource(
                        stripped_row[0], stripped_row[2], stripped_row[3]
                    )
        except Exception as e:
            print("{e}")

    def get_ra_dec(self, source_name):
        source = self.sources[source_name]
        ra = source.ra
        dec = source.dec
        return ra.strip(), dec.strip()

    def get_current_time():
        # '2022-12-07 07:00:00'
        datetime_object = datetime.datetime.now()
        return datetime_object.strftime("%Y-%m-%d %H:%M:%S")

    def check_trajectory(self, duration, time_resolution, source_name):
        observe_time = Time(datetime.now(), format="datetime")
        ra_dec = self.get_ra_dec(source_name)
        target = SkyCoord(ra_dec[0], ra_dec[1], frame=FK5(equinox=Time("J2000")),
                          unit=(u.hourangle, u.deg)
                          )
        observe_time_span = observe_time + np.arange(0, duration, time_resolution/60) * u.hour
        time = observe_time_span.to_datetime()
        # Coordinate transformations
        altaz = AltAz(location=self.location, obstime=observe_time_span)
        target_az_el = target.transform_to(altaz)
        return time, target_az_el.az.degree, target_az_el.alt.degree
