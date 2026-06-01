# whatsup

A small FastAPI and React app for plotting the current azimuth/elevation trajectory of astronomical sources over a requested time range.

The original Tkinter app is still available as `whatsup.py`; the web rewrite is served by FastAPI from `backend/app/main.py`.

## Run

Install Python dependencies:

```bash
pip install -r pip-requirements.txt
```

Start the web app:

```bash
uvicorn backend.app.main:app --reload
```

Open:

```text
http://127.0.0.1:8000/
```

The browser UI uses React, Tailwind CSS, and Chart.js from CDNs for this first iteration.

## Location

The default observing location comes from `location.ini`.

The web app does not use a database. When a user edits the observing location, the location is stored in that browser's `localStorage` under `whatsup.location` and sent with each plot request.

## API

List sources:

```http
GET /api/sources
```

Get the default location:

```http
GET /api/location/default
```

Plot one source:

```http
POST /api/trajectory
Content-Type: application/json

{
  "source_name": "3c48",
  "duration_hours": 10,
  "step_minutes": 30,
  "location": {
    "name": "Kuntunse",
    "latitude": 5.750721,
    "longitude": -0.304974,
    "altitude": 116
  }
}
```

Plot every source:

```http
POST /api/trajectories
Content-Type: application/json

{
  "duration_hours": 10,
  "step_minutes": 30,
  "location": {
    "name": "Kuntunse",
    "latitude": 5.750721,
    "longitude": -0.304974,
    "altitude": 116
  }
}
```
