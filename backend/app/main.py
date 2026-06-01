from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import astropy.units as u
from astropy.coordinates import SkyCoord
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from source_manager import ObserverLocation, SourceManager

try:
    from astroquery.simbad import Simbad
    from astroquery.vizier import Vizier
except ImportError:
    Simbad = None
    Vizier = None


ROOT_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"

app = FastAPI(title="WhatsUp Astronomy API")
source_manager = SourceManager()
CATALOG_TIMEOUT_SECONDS = 12


class LocationPayload(BaseModel):
    name: str = Field(default="Custom site", min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: float = Field(default=0)
    timezone: str = Field(default="UTC", min_length=1)

    def to_observer_location(self) -> ObserverLocation:
        return ObserverLocation(
            name=self.name,
            latitude=self.latitude,
            longitude=self.longitude,
            altitude=self.altitude,
            timezone=self.timezone,
        )


class SourcePayload(BaseModel):
    name: str = Field(min_length=1)
    ra: str = Field(min_length=1)
    dec: str = Field(min_length=1)
    provider: str = Field(default="catalog")
    catalog: str | None = None


class CatalogSearchRequest(BaseModel):
    provider: Literal["simbad", "vizier"] = "simbad"
    query: str = Field(min_length=1, max_length=200)
    row_limit: int = Field(default=8, ge=1, le=25)


class TrajectoryRequest(BaseModel):
    source_name: str | None = None
    source: SourcePayload | None = None
    duration_hours: float = Field(default=10, gt=0, le=60)
    step_minutes: float = Field(default=30, gt=0, le=1440)
    location: LocationPayload | None = None
    start_time: datetime | None = None


class AllTrajectoriesRequest(BaseModel):
    duration_hours: float = Field(default=10, gt=0, le=60)
    step_minutes: float = Field(default=30, gt=0, le=1440)
    location: LocationPayload | None = None
    start_time: datetime | None = None


class VisibilityRequest(BaseModel):
    source_name: str | None = None
    source: SourcePayload | None = None
    location: LocationPayload | None = None
    at_time: datetime | None = None


def location_payload(location: ObserverLocation) -> dict:
    return {
        "name": location.name,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "altitude": location.altitude,
        "timezone": location.timezone,
    }


def request_location(location: LocationPayload | None) -> ObserverLocation:
    if location is None:
        return source_manager.get_location()
    return location.to_observer_location()


def source_payload(source: SourcePayload) -> dict:
    result = {
        "name": source.name,
        "ra": source.ra,
        "dec": source.dec,
        "provider": source.provider,
    }
    if source.catalog:
        result["catalog"] = source.catalog
    return result


def _builtin_source_payload(source_name: str) -> SourcePayload:
    ra, dec = source_manager.get_ra_dec(source_name)
    return SourcePayload(name=source_name, ra=ra, dec=dec, provider="builtin")


def _selected_source(request: TrajectoryRequest | VisibilityRequest) -> SourcePayload:
    if request.source is not None:
        return request.source
    if request.source_name:
        try:
            return _builtin_source_payload(request.source_name)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=f"Unknown source: {error.args[0]}")
    raise HTTPException(status_code=400, detail="Select a source before calculating.")


def _trajectory_from_source(
    source: SourcePayload,
    duration_hours: float,
    step_minutes: float,
    location: ObserverLocation,
    start_time: datetime | None = None,
):
    if source.provider == "builtin" and source.name in source_manager.sources:
        return source_manager.check_trajectory_at_location(
            duration_hours,
            step_minutes,
            source.name,
            location,
            start_time=start_time,
        )

    return source_manager.check_trajectory_for_coordinates(
        duration_hours,
        step_minutes,
        source.name,
        source.ra,
        source.dec,
        location,
        start_time=start_time,
    )


def serialise_points(times, azimuth, elevation) -> list[dict]:
    points = []
    for timestamp, azimuth_value, elevation_value in zip(times, azimuth, elevation):
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        points.append(
            {
                "time": timestamp.isoformat(),
                "azimuth": float(azimuth_value),
                "elevation": float(elevation_value),
            }
        )
    return points


def _column_by_name(table, candidates):
    columns_by_lower = {name.lower(): name for name in table.colnames}
    for candidate in candidates:
        if candidate.lower() in columns_by_lower:
            return columns_by_lower[candidate.lower()]
    return None


def _normalised_column_name(name):
    return "".join(character for character in name.lower() if character.isalnum())


def _coordinate_columns(table):
    normalised = {_normalised_column_name(name): name for name in table.colnames}
    ra_candidates = ("raj2000", "raicrs", "ra", "radeg")
    dec_candidates = ("dej2000", "deicrs", "dec", "dedeg")
    ra_column = next((normalised[name] for name in ra_candidates if name in normalised), None)
    dec_column = next((normalised[name] for name in dec_candidates if name in normalised), None)
    return ra_column, dec_column


def _is_missing(value) -> bool:
    return value is None or bool(getattr(value, "mask", False))


def _is_numeric(value) -> bool:
    try:
        float(value)
        return True
    except (TypeError, ValueError):
        return False


def _ra_unit(ra_unit):
    unit_text = str(ra_unit or "").lower()
    if unit_text in {"h", "hour", "hourangle"} or "hour" in unit_text:
        return u.hourangle
    return u.deg


def _coordinate_payload(ra_value, dec_value, ra_unit=None, dec_unit=None):
    if _is_missing(ra_value) or _is_missing(dec_value):
        raise ValueError("Missing RA or Dec in catalog result.")

    ra_text = str(ra_value).strip()
    dec_text = str(dec_value).strip()
    if not ra_text or not dec_text:
        raise ValueError("Missing RA or Dec in catalog result.")

    if _is_numeric(ra_text) and _is_numeric(dec_text):
        dec_angle_unit = u.Unit(dec_unit) if dec_unit else u.deg
        coord = SkyCoord(
            float(ra_text) * _ra_unit(ra_unit),
            float(dec_text) * dec_angle_unit,
            frame="icrs",
        )
    else:
        coord = SkyCoord(ra_text, dec_text, unit=(u.hourangle, u.deg), frame="icrs")

    return {
        "ra": str(coord.ra.to_string(unit=u.hourangle, sep=":", precision=2, pad=True)),
        "dec": str(
            coord.dec.to_string(
                unit=u.deg,
                sep=":",
                precision=2,
                alwayssign=True,
                pad=True,
            )
        ),
    }


def _simbad_results(query: str) -> list[dict]:
    if Simbad is None:
        raise HTTPException(status_code=503, detail="astroquery is not installed.")

    simbad = Simbad(timeout=CATALOG_TIMEOUT_SECONDS)
    table = simbad.query_object(query)
    if table is None or len(table) == 0:
        return []

    row = table[0]
    name_column = _column_by_name(table, ("main_id", "MAIN_ID"))
    ra_column = _column_by_name(table, ("ra", "RA"))
    dec_column = _column_by_name(table, ("dec", "DEC"))
    if not ra_column or not dec_column:
        return []

    coordinates = _coordinate_payload(
        row[ra_column],
        row[dec_column],
        table[ra_column].unit,
        table[dec_column].unit,
    )
    return [
        {
            "name": str(row[name_column]).strip() if name_column else query,
            "provider": "simbad",
            "catalog": "SIMBAD",
            **coordinates,
        }
    ]


def _row_name(row, table, fallback):
    name_column = _column_by_name(
        table,
        ("main_id", "MAIN_ID", "name", "Name", "ID", "id", "Source", "source", "_2MASS"),
    )
    if name_column and not _is_missing(row[name_column]):
        name = str(row[name_column]).strip()
        if name:
            return name
    return fallback


def _vizier_results(query: str, row_limit: int) -> list[dict]:
    if Vizier is None:
        raise HTTPException(status_code=503, detail="astroquery is not installed.")

    vizier = Vizier(columns=["**"], row_limit=row_limit, timeout=CATALOG_TIMEOUT_SECONDS)
    tables = vizier.get_catalogs(query)

    results = []
    for table_name, table in getattr(tables, "items", lambda: enumerate(tables))():
        ra_column, dec_column = _coordinate_columns(table)
        if not ra_column or not dec_column:
            continue
        catalog_name = table.meta.get("ID") or table.meta.get("name") or str(table_name)

        for index, row in enumerate(table[:row_limit]):
            try:
                coordinates = _coordinate_payload(
                    row[ra_column],
                    row[dec_column],
                    table[ra_column].unit,
                    table[dec_column].unit,
                )
            except ValueError:
                continue

            results.append(
                {
                    "name": _row_name(row, table, f"{query} #{index + 1}"),
                    "provider": "vizier",
                    "catalog": str(catalog_name),
                    **coordinates,
                }
            )
            if len(results) >= row_limit:
                return results

    return results


@app.get("/")
def index():
    index_path = FRONTEND_DIST_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/location/default")
def default_location():
    return location_payload(source_manager.get_location())


@app.get("/api/sources")
def sources():
    return {"sources": source_manager.get_sources()}


@app.post("/api/catalog/search")
def catalog_search(request: CatalogSearchRequest):
    try:
        if request.provider == "simbad":
            results = _simbad_results(request.query.strip())
        else:
            results = _vizier_results(request.query.strip(), request.row_limit)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=502, detail=f"Catalog lookup failed: {error}")

    return {
        "provider": request.provider,
        "query": request.query,
        "sources": results,
    }


@app.post("/api/trajectory")
def trajectory(request: TrajectoryRequest):
    location = request_location(request.location)
    source = _selected_source(request)

    try:
        times, azimuth, elevation = _trajectory_from_source(
            source,
            request.duration_hours,
            request.step_minutes,
            location,
            start_time=request.start_time,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    return {
        "source": source_payload(source),
        "location": location_payload(location),
        "duration_hours": request.duration_hours,
        "step_minutes": request.step_minutes,
        "points": serialise_points(times, azimuth, elevation),
    }


@app.post("/api/visibility")
def visibility(request: VisibilityRequest):
    location = request_location(request.location)
    source = _selected_source(request)

    try:
        times, azimuth, elevation = _trajectory_from_source(
            source,
            1 / 60,
            1,
            location,
            start_time=request.at_time,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    elevation_value = float(elevation[0])
    return {
        "source": source_payload(source),
        "time": (
            times[0].replace(tzinfo=timezone.utc)
            if times[0].tzinfo is None
            else times[0]
        ).isoformat(),
        "azimuth": float(azimuth[0]),
        "elevation": elevation_value,
        "status": "visible" if elevation_value >= 0 else "below horizon",
    }


@app.post("/api/trajectories")
def trajectories(request: AllTrajectoriesRequest):
    location = request_location(request.location)

    try:
        result = source_manager.check_all_trajectories_at_location(
            request.duration_hours,
            request.step_minutes,
            location,
            start_time=request.start_time,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    datasets = []
    for source_name, (times, azimuth, elevation) in result.items():
        ra, dec = source_manager.get_ra_dec(source_name)
        datasets.append(
            {
                "source": {"name": source_name, "ra": ra, "dec": dec},
                "points": serialise_points(times, azimuth, elevation),
            }
        )

    return {
        "location": location_payload(location),
        "duration_hours": request.duration_hours,
        "step_minutes": request.step_minutes,
        "datasets": datasets,
    }

if (FRONTEND_DIST_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST_DIR / "assets"), name="assets")
