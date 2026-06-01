# whatsup

A small FastAPI and React app for planning observations by plotting source elevation over requested observing windows.

The original Tkinter app is still available as `whatsup.py`; the web rewrite is served by FastAPI from `backend/app/main.py`.

## Run

Install Python dependencies:

```bash
pip install -r pip-requirements.txt
```

Install frontend dependencies:

```bash
cd frontend
npm install
```

Run the React app with Vite during development:

```bash
npm run dev
```

Vite serves the UI at:

```text
http://127.0.0.1:5173/
```

Start the FastAPI API in another terminal:

```bash
uvicorn backend.app.main:app --reload
```

For FastAPI to serve the compiled frontend directly, build the Vite app first:

```bash
cd frontend
npm run build
```

Then open:

```text
http://127.0.0.1:8000/
```

The browser UI is a Vite React app using Tailwind CSS and Chart.js.

## Location

The default observing location comes from `location.ini`.

The web app does not use a database. When a user edits the observing location, the location is stored in that browser's `localStorage` under `whatsup.location` and sent with each plot request.

Location setup is opened from the `Change location` button. The dialog accepts latitude, longitude, altitude, and an optional Google Maps Embed API key. If a key is provided, the app embeds a Google Maps iframe centered on the entered coordinates. The key is stored only in browser `localStorage` under `whatsup.googleMapsApiKey`.

## API

List sources:

```http
GET /api/sources
```

Get the default location:

```http
GET /api/location/default
```

Check whether a source is visible at a specific time:

```http
POST /api/visibility
Content-Type: application/json

{
  "source_name": "3c48",
  "at_time": "2026-06-01T15:30:00Z",
  "location": {
    "name": "Kuntunse",
    "latitude": 5.750721,
    "longitude": -0.304974,
    "altitude": 116
  }
}
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
