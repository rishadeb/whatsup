from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from source_manager import ObserverLocation, SourceManager


ROOT_DIR = Path(__file__).resolve().parents[2]
FRONTEND_DIR = ROOT_DIR / "frontend"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"

app = FastAPI(title="WhatsUp Astronomy API")
source_manager = SourceManager()


class LocationPayload(BaseModel):
    name: str = Field(default="Custom site", min_length=1)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: float = Field(default=0)

    def to_observer_location(self) -> ObserverLocation:
        return ObserverLocation(
            name=self.name,
            latitude=self.latitude,
            longitude=self.longitude,
            altitude=self.altitude,
        )


class TrajectoryRequest(BaseModel):
    source_name: str
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
    source_name: str
    location: LocationPayload | None = None
    at_time: datetime | None = None


def location_payload(location: ObserverLocation) -> dict:
    return {
        "name": location.name,
        "latitude": location.latitude,
        "longitude": location.longitude,
        "altitude": location.altitude,
    }


def request_location(location: LocationPayload | None) -> ObserverLocation:
    if location is None:
        return source_manager.get_location()
    return location.to_observer_location()


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


@app.post("/api/trajectory")
def trajectory(request: TrajectoryRequest):
    location = request_location(request.location)

    try:
        times, azimuth, elevation = source_manager.check_trajectory_at_location(
            request.duration_hours,
            request.step_minutes,
            request.source_name,
            location,
            start_time=request.start_time,
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown source: {error.args[0]}")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    ra, dec = source_manager.get_ra_dec(request.source_name)
    return {
        "source": {"name": request.source_name, "ra": ra, "dec": dec},
        "location": location_payload(location),
        "duration_hours": request.duration_hours,
        "step_minutes": request.step_minutes,
        "points": serialise_points(times, azimuth, elevation),
    }


@app.post("/api/visibility")
def visibility(request: VisibilityRequest):
    location = request_location(request.location)

    try:
        times, azimuth, elevation = source_manager.check_trajectory_at_location(
            1 / 60,
            1,
            request.source_name,
            location,
            start_time=request.at_time,
        )
    except KeyError as error:
        raise HTTPException(status_code=404, detail=f"Unknown source: {error.args[0]}")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))

    elevation_value = float(elevation[0])
    return {
        "source_name": request.source_name,
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
