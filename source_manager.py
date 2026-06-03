import os
import tempfile
from pathlib import Path

ASTROPY_RUNTIME_DIR = Path(
    os.environ.get("WHATSUP_RUNTIME_DIR", Path(tempfile.gettempdir()) / "whatsup-astropy")
)
ASTROPY_HOME_DIR = ASTROPY_RUNTIME_DIR / "home"
ASTROPY_CACHE_DIR = Path(os.environ.get("WHATSUP_CACHE_DIR", ASTROPY_RUNTIME_DIR / "cache"))
ASTROPY_CONFIG_DIR = Path(os.environ.get("WHATSUP_CONFIG_DIR", ASTROPY_RUNTIME_DIR / "config"))

ASTROPY_RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
ASTROPY_HOME_DIR.mkdir(parents=True, exist_ok=True)
ASTROPY_CACHE_DIR.mkdir(parents=True, exist_ok=True)
ASTROPY_CONFIG_DIR.mkdir(parents=True, exist_ok=True)

try:
    home_path = Path.home()
    home_path.mkdir(parents=True, exist_ok=True)
    test_path = home_path / ".whatsup-write-test"
    test_path.write_text("", encoding="utf-8")
    test_path.unlink()
except OSError:
    os.environ["HOME"] = str(ASTROPY_HOME_DIR)

os.environ["XDG_CACHE_HOME"] = str(ASTROPY_CACHE_DIR)
os.environ["XDG_CONFIG_HOME"] = str(ASTROPY_CONFIG_DIR)
os.environ["ASTROPY_CACHE_DIR"] = str(ASTROPY_CACHE_DIR)

import astropy.units as u

from astroplan import Observer
from astropy.config.paths import set_temp_cache, set_temp_config
from astropy.coordinates import SkyCoord, AltAz, EarthLocation, FK5
from astropy.time import Time
from astropy.utils import iers

import numpy as np
import csv
import configparser

from datetime import datetime, timezone

from dataclasses import dataclass


iers.conf.auto_download = False
iers.conf.auto_max_age = None
set_temp_cache(ASTROPY_CACHE_DIR, delete=False)
set_temp_config(ASTROPY_CONFIG_DIR, delete=False)


@dataclass
class AstroSource:
    source_name: str
    ra: str
    dec: str


@dataclass
class ObserverLocation:
    name: str
    latitude: float
    longitude: float
    altitude: float
    timezone: str = "UTC"


class SourceManager:
    def __init__(self, location: ObserverLocation | None = None):
        self.sources = {}
        self.source_names = {}
        self.filename = ""
        self.config = configparser.ConfigParser()
        self.location_config = location or self.config_loader()
        self.read_csv()
        self.location = self._earth_location(self.location_config)
        self.observer = Observer(location=self.location, name=self.location_config.name)

    def config_loader(self):
        self.config.read(Path(__file__).with_name("location.ini"))
        return ObserverLocation(
            name=self.config["LOCATION"]["name"],
            latitude=self.config.getfloat("LOCATION", "latitude"),
            longitude=self.config.getfloat("LOCATION", "longitude"),
            altitude=self.config.getfloat("LOCATION", "altitude"),
            timezone=self.config["LOCATION"].get("timezone", "UTC"),
        )

    def read_csv(self, filename="sources.csv"):
        # Open the csv, filter comments and strip spaces and tabs
        try:
            path = Path(filename)
            if not path.is_absolute():
                path = Path(__file__).with_name(filename)
            with path.open("r") as file:
                csvreader = csv.reader(
                    row for row in file if row.strip() and not row.lstrip().startswith("#")
                )
                for row in csvreader:
                    stripped_row = [cell.strip() for cell in row]
                    self.sources[stripped_row[0]] = AstroSource(
                        stripped_row[0], stripped_row[2], stripped_row[3]
                    )
        except Exception as e:
            print(e)

    def get_ra_dec(self, source_name):
        source = self.sources[source_name]
        ra = source.ra
        dec = source.dec
        return ra.strip(), dec.strip()

    def get_sources(self):
        return [
            {"name": source.source_name, "ra": source.ra.strip(), "dec": source.dec.strip()}
            for source in self.sources.values()
        ]

    def get_location(self):
        return self.location_config

    def _earth_location(self, location):
        return EarthLocation.from_geodetic(
            lat=location.latitude * u.deg,
            lon=location.longitude * u.deg,
            height=location.altitude * u.m,
        )

    def _trajectory_for_source(
        self,
        duration,
        time_resolution,
        source,
        location,
        start_time=None,
    ):
        if duration <= 0:
            raise ValueError("duration must be greater than zero")
        if time_resolution <= 0:
            raise ValueError("time_resolution must be greater than zero")

        if start_time is None:
            start_time = datetime.now(timezone.utc)
        observe_time = Time(start_time, format="datetime")

        target = SkyCoord(
            source.ra.strip(),
            source.dec.strip(),
            frame=FK5(equinox=Time("J2000")),
            unit=(u.hourangle, u.deg),
        )
        observe_time_span = observe_time + np.arange(0, duration, time_resolution/60) * u.hour
        time = observe_time_span.to_datetime()
        # Coordinate transformations
        altaz = AltAz(location=self._earth_location(location), obstime=observe_time_span)
        target_az_el = target.transform_to(altaz)
        return time, target_az_el.az.degree, target_az_el.alt.degree

    def _trajectory_for_location(
        self,
        duration,
        time_resolution,
        source_name,
        location,
        start_time=None,
    ):
        if source_name not in self.sources:
            raise KeyError(source_name)

        return self._trajectory_for_source(
            duration,
            time_resolution,
            self.sources[source_name],
            location,
            start_time=start_time,
        )

    def check_trajectory(self, duration, time_resolution, source_name):
        return self._trajectory_for_location(
            duration,
            time_resolution,
            source_name,
            self.location_config,
        )

    def check_trajectory_at_location(
        self,
        duration,
        time_resolution,
        source_name,
        location,
        start_time=None,
    ):
        return self._trajectory_for_location(
            duration,
            time_resolution,
            source_name,
            location,
            start_time=start_time,
        )

    def check_trajectory_for_coordinates(
        self,
        duration,
        time_resolution,
        source_name,
        ra,
        dec,
        location,
        start_time=None,
    ):
        return self._trajectory_for_source(
            duration,
            time_resolution,
            AstroSource(source_name, ra, dec),
            location,
            start_time=start_time,
        )

    def check_all_trajectories_at_location(
        self,
        duration,
        time_resolution,
        location,
        start_time=None,
    ):
        return {
            source_name: self.check_trajectory_at_location(
                duration,
                time_resolution,
                source_name,
                location,
                start_time=start_time,
            )
            for source_name in self.sources.keys()
        }
