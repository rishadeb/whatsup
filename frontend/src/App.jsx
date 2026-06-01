import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart,
  LinearScale,
  LineElement,
  PointElement,
  ScatterController,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(LinearScale, LineElement, PointElement, ScatterController, Tooltip, Legend);

const STORAGE_KEY = "whatsup.location";
const MAPS_API_KEY_STORAGE_KEY = "whatsup.googleMapsApiKey";
const palette = [
  "#2563eb",
  "#059669",
  "#dc2626",
  "#7c3aed",
  "#ca8a04",
  "#0891b2",
  "#db2777",
  "#4f46e5",
  "#16a34a",
  "#ea580c",
  "#64748b",
  "#0f766e",
  "#be123c",
  "#9333ea",
  "#1d4ed8",
];

function loadStoredLocation() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function loadStoredString(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function numberInputValue(value) {
  return Number.isFinite(Number(value)) ? value : "";
}

function buildMapsEmbedUrl(location, apiKey) {
  if (!location || !apiKey) return "";
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "";
  const center = `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
  const params = new URLSearchParams({
    key: apiKey,
    center,
    zoom: "8",
    maptype: "satellite",
  });
  return `https://www.google.com/maps/embed/v1/view?${params.toString()}`;
}

function toLocalInputValue(date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function formatTime(value) {
  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hoursBetween(startValue, endValue) {
  const start = new Date(startValue);
  const end = new Date(endValue);
  return (end.getTime() - start.getTime()) / 3600000;
}

function defaultWindow() {
  const start = new Date();
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  const end = new Date(start.getTime() + 2 * 3600000);
  return {
    startTime: toLocalInputValue(start),
    endTime: toLocalInputValue(end),
  };
}

function inputClass(extra = "") {
  return [
    "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function VisibilityBadge({ status, loading }) {
  if (loading) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
        checking
      </span>
    );
  }

  if (!status) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
        not checked
      </span>
    );
  }

  const visible = status.status === "visible";
  return (
    <span
      className={[
        "rounded-full px-2.5 py-1 text-xs font-semibold",
        visible ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700",
      ].join(" ")}
    >
      {status.status}
    </span>
  );
}

function ObservationChart({ planItems, loading }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const chartConfig = useMemo(() => {
    if (!planItems.length) return null;

    const allTimes = planItems.flatMap((item) =>
      item.points.map((point) => Date.parse(point.time)),
    );
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);
    const datasets = planItems.map((item, index) => ({
      label: item.source.name,
      data: item.points.map((point) => ({
        x: Date.parse(point.time),
        y: point.elevation,
        azimuth: point.azimuth,
        time: point.time,
      })),
      showLine: true,
      tension: 0.25,
      pointRadius: 3,
      pointHoverRadius: 6,
      borderWidth: 2,
      borderColor: palette[index % palette.length],
      backgroundColor: palette[index % palette.length],
    }));

    datasets.push({
      label: "Horizon",
      data: [
        { x: minTime, y: 0 },
        { x: maxTime, y: 0 },
      ],
      showLine: true,
      pointRadius: 0,
      borderDash: [6, 6],
      borderWidth: 2,
      borderColor: "#334155",
      backgroundColor: "#334155",
    });

    return {
      type: "scatter",
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: "nearest",
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 10, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              title: (items) => formatTime(items[0].raw.time || items[0].raw.x),
              label: (context) => {
                if (context.dataset.label === "Horizon") return "Horizon: 0.00 deg";
                const point = context.raw;
                return `${context.dataset.label}: El ${point.y.toFixed(2)} deg, Az ${point.azimuth.toFixed(2)} deg`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: "Observation time" },
            grid: { color: "#e2e8f0" },
            ticks: {
              callback: (value) => formatTime(Number(value)),
              maxRotation: 0,
              autoSkip: true,
            },
          },
          y: {
            title: { display: true, text: "Elevation (degrees)" },
            grid: { color: "#e2e8f0" },
          },
        },
      },
    };
  }, [planItems]);

  useEffect(() => {
    if (!chartConfig) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return;
    }
    if (!canvasRef.current) return;

    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, chartConfig);

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [chartConfig]);

  if (!chartConfig) {
    return (
      <div className="flex min-h-[460px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        {loading ? "Calculating plan..." : "Add a source window to begin planning."}
      </div>
    );
  }

  return (
    <div className="min-h-[460px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <canvas ref={canvasRef} className="h-[460px] w-full" />
    </div>
  );
}

function LocationDialog({
  open,
  draftLocation,
  mapApiKey,
  onClose,
  onDefault,
  onLocationChange,
  onMapApiKeyChange,
  onSave,
}) {
  if (!open) return null;

  const embedUrl = buildMapsEmbedUrl(draftLocation, mapApiKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Observing location</h2>
            <p className="mt-1 text-sm text-slate-600">
              Set the observer coordinates and preview the site with Google Maps.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <form
          className="grid max-h-[calc(92vh-73px)] gap-5 overflow-y-auto p-5 lg:grid-cols-[360px_1fr]"
          onSubmit={onSave}
        >
          <div className="space-y-4">
            <Field label="Name">
              <input
                className={inputClass()}
                value={draftLocation?.name || ""}
                onChange={(event) => onLocationChange("name", event.target.value)}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <input
                  className={inputClass()}
                  type="number"
                  step="0.000001"
                  min="-90"
                  max="90"
                  value={numberInputValue(draftLocation?.latitude)}
                  onChange={(event) => onLocationChange("latitude", event.target.value)}
                  required
                />
              </Field>
              <Field label="Longitude">
                <input
                  className={inputClass()}
                  type="number"
                  step="0.000001"
                  min="-180"
                  max="180"
                  value={numberInputValue(draftLocation?.longitude)}
                  onChange={(event) => onLocationChange("longitude", event.target.value)}
                  required
                />
              </Field>
            </div>

            <Field label="Altitude metres">
              <input
                className={inputClass()}
                type="number"
                step="1"
                value={numberInputValue(draftLocation?.altitude)}
                onChange={(event) => onLocationChange("altitude", event.target.value)}
                required
              />
            </Field>

            <Field label="Google Maps API key">
              <input
                className={inputClass()}
                type="password"
                value={mapApiKey}
                onChange={(event) => onMapApiKeyChange(event.target.value)}
                placeholder="Maps Embed API key"
              />
            </Field>

            <p className="text-xs leading-5 text-slate-500">
              The key is stored only in this browser. Enable the Google Maps Embed API and
              restrict the key to this local origin when possible.
            </p>

            <div className="flex gap-2">
              <button className="flex-1 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800">
                Save location
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                onClick={onDefault}
              >
                Default
              </button>
            </div>
          </div>

          <div className="min-h-[360px] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            {embedUrl ? (
              <iframe
                title="Google map observing location"
                className="h-[420px] w-full"
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={embedUrl}
              />
            ) : (
              <div className="flex h-[420px] items-center justify-center p-6 text-center text-sm text-slate-500">
                Enter a Google Maps API key to preview this latitude and longitude.
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const initialWindow = defaultWindow();
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [startTime, setStartTime] = useState(initialWindow.startTime);
  const [endTime, setEndTime] = useState(initialWindow.endTime);
  const [stepMinutes, setStepMinutes] = useState(15);
  const [location, setLocation] = useState(loadStoredLocation());
  const [draftLocation, setDraftLocation] = useState(loadStoredLocation());
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [mapApiKey, setMapApiKey] = useState(loadStoredString(MAPS_API_KEY_STORAGE_KEY));
  const [visibility, setVisibility] = useState(null);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [planItems, setPlanItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      try {
        const [sourceResponse, locationResponse] = await Promise.all([
          fetch("/api/sources"),
          fetch("/api/location/default"),
        ]);
        const sourceJson = await sourceResponse.json();
        const defaultLocation = await locationResponse.json();
        const storedLocation = loadStoredLocation();

        setSources(sourceJson.sources);
        setSelectedSource(sourceJson.sources[0]?.name || "");
        if (!storedLocation) {
          setLocation(defaultLocation);
          setDraftLocation(defaultLocation);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultLocation));
        }
      } catch (nextError) {
        setError(nextError.message || "Unable to load app data.");
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedSource || !location || !startTime) return;
    let ignore = false;

    async function checkVisibility() {
      setVisibilityLoading(true);
      setVisibility(null);
      try {
        const response = await fetch("/api/visibility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_name: selectedSource,
            location,
            at_time: new Date(startTime).toISOString(),
          }),
        });
        const nextVisibility = await response.json();
        if (!response.ok) {
          throw new Error(nextVisibility.detail || "Unable to check visibility.");
        }
        if (!ignore) setVisibility(nextVisibility);
      } catch (nextError) {
        if (!ignore) setError(nextError.message || "Unable to check visibility.");
      } finally {
        if (!ignore) setVisibilityLoading(false);
      }
    }

    checkVisibility();
    return () => {
      ignore = true;
    };
  }, [selectedSource, startTime, location]);

  async function addObservation(event) {
    event.preventDefault();
    setError("");

    const durationHours = hoursBetween(startTime, endTime);
    if (!selectedSource) {
      setError("Select a source before adding an observation.");
      return;
    }
    if (planItems.some((item) => item.source.name === selectedSource)) {
      setError(`${selectedSource} is already in the observation plan.`);
      return;
    }
    if (!location) {
      setError("Save an observing location before adding an observation.");
      return;
    }
    if (!Number.isFinite(durationHours) || durationHours <= 0) {
      setError("End time must be after start time.");
      return;
    }
    if (durationHours > 60) {
      setError("Observation windows are limited to 60 hours in this version.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/trajectory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_name: selectedSource,
          duration_hours: durationHours,
          step_minutes: Number(stepMinutes),
          location,
          start_time: new Date(startTime).toISOString(),
        }),
      });
      const trajectory = await response.json();
      if (!response.ok) {
        throw new Error(trajectory.detail || "Unable to calculate trajectory.");
      }

      setPlanItems((current) => [
        ...current,
        {
          id: `${selectedSource}-${Date.now()}`,
          source: trajectory.source,
          startTime,
          endTime,
          status: visibility?.status || "not checked",
          points: trajectory.points,
        },
      ]);
      const nextSource = sources.find(
        (source) =>
          source.name !== selectedSource &&
          !planItems.some((item) => item.source.name === source.name),
      );
      if (nextSource) setSelectedSource(nextSource.name);
    } catch (nextError) {
      setError(nextError.message || "Unable to calculate trajectory.");
    } finally {
      setLoading(false);
    }
  }

  function removeObservation(id) {
    setPlanItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed && current.some((item) => item.source.name === selectedSource)) {
        setSelectedSource(removed.source.name);
      }
      return current.filter((item) => item.id !== id);
    });
  }

  function updateDraftLocation(field, value) {
    setDraftLocation((current) => ({
      ...(current || {}),
      [field]: field === "name" ? value : Number(value),
    }));
  }

  function saveLocation(event) {
    event.preventDefault();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(draftLocation));
    localStorage.setItem(MAPS_API_KEY_STORAGE_KEY, mapApiKey);
    setLocation(draftLocation);
    setLocationDialogOpen(false);
    setPlanItems([]);
  }

  function useDefaultLocation() {
    fetch("/api/location/default")
      .then((response) => response.json())
      .then((defaultLocation) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultLocation));
        setDraftLocation(defaultLocation);
        setLocation(defaultLocation);
        setPlanItems([]);
      })
      .catch((nextError) => setError(nextError.message || "Unable to load default location."));
  }

  const selectedSourceDetails = sources.find((source) => source.name === selectedSource);
  const plannedSourceNames = new Set(planItems.map((item) => item.source.name));
  const selectedSourceAlreadyPlanned = plannedSourceNames.has(selectedSource);
  const totalPoints = planItems.reduce((total, item) => total + item.points.length, 0);
  const visibleCount = planItems.filter((item) =>
    item.points.some((point) => point.elevation >= 0),
  ).length;
  const windowHours = hoursBetween(startTime, endTime);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 antialiased">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              WhatsUp
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Observation planner
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Build a source-by-source observing plan and compare elevation windows from
              the browser&apos;s saved location.
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="font-medium text-slate-950">
              {location?.name || "No location selected"}
            </div>
            <div>
              {location
                ? `${location.latitude}, ${location.longitude} at ${location.altitude} m`
                : "Load or save a location"}
            </div>
            <button
              type="button"
              className="mt-3 rounded-md bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              onClick={() => {
                setDraftLocation(location || draftLocation);
                setLocationDialogOpen(true);
              }}
            >
              Change location
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-5">
          <form
            className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            onSubmit={addObservation}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-950">Add observation</h2>
              <VisibilityBadge status={visibility} loading={visibilityLoading} />
            </div>

            {selectedSourceDetails && (
              <p className="mt-2 text-xs text-slate-500">
                RA {selectedSourceDetails.ra} / Dec {selectedSourceDetails.dec}
              </p>
            )}

            <div className="mt-4 space-y-4">
              <Field label="Source">
                <select
                  className={inputClass()}
                  value={selectedSource}
                  onChange={(event) => setSelectedSource(event.target.value)}
                >
                  {sources.map((source) => (
                    <option
                      key={source.name}
                      value={source.name}
                      disabled={plannedSourceNames.has(source.name)}
                    >
                      {plannedSourceNames.has(source.name)
                        ? `${source.name} (planned)`
                        : source.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Start time">
                <input
                  className={inputClass()}
                  type="datetime-local"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </Field>

              <Field label="End time">
                <input
                  className={inputClass()}
                  type="datetime-local"
                  value={endTime}
                  onChange={(event) => setEndTime(event.target.value)}
                  required
                />
              </Field>

              <Field label="Sampling step minutes">
                <input
                  className={inputClass()}
                  type="number"
                  min="1"
                  step="1"
                  value={numberInputValue(stepMinutes)}
                  onChange={(event) => setStepMinutes(event.target.value)}
                />
              </Field>

              <div className="rounded-md bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                {visibility
                  ? selectedSourceAlreadyPlanned
                    ? `${selectedSource} is already in the plan. Remove it before adding a new window.`
                    : `At the selected start time: ${visibility.elevation.toFixed(2)} deg elevation, ${visibility.azimuth.toFixed(2)} deg azimuth.`
                  : selectedSourceAlreadyPlanned
                    ? `${selectedSource} is already in the plan.`
                    : "Select a source and start time to check visibility."}
              </div>

              {selectedSourceAlreadyPlanned && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
                  Each source can only appear once in the active plan.
                </div>
              )}

              <button
                className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={loading || visibilityLoading || !location || selectedSourceAlreadyPlanned}
              >
                {loading
                  ? "Calculating..."
                  : `Add ${Number.isFinite(windowHours) && windowHours > 0 ? windowHours.toFixed(1) : ""} hr plot`}
              </button>
            </div>
          </form>
        </aside>

        <div className="space-y-5">
          <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                Planned source elevation
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {planItems.length
                  ? `${planItems.length} source windows, ${totalPoints} calculated points`
                  : "Add sources to compare observing windows."}
              </p>
            </div>
            <div className="text-sm text-slate-600">
              {visibleCount}/{planItems.length || 0} windows rise above the horizon
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          <ObservationChart planItems={planItems} loading={loading} />

          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-base font-semibold text-slate-950">
                Observation windows
              </h2>
            </div>
            {planItems.length ? (
              <div className="divide-y divide-slate-100">
                {planItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: palette[index % palette.length] }}
                        />
                        <span className="font-medium text-slate-950">
                          {item.source.name}
                        </span>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            item.status === "visible"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700",
                          ].join(" ")}
                        >
                          {item.status}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        {formatTime(item.startTime)} to {formatTime(item.endTime)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="self-start rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:self-auto"
                      onClick={() => removeObservation(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-slate-500">
                No observation windows added yet.
              </p>
            )}
          </div>
        </div>
      </section>

      <LocationDialog
        open={locationDialogOpen}
        draftLocation={draftLocation}
        mapApiKey={mapApiKey}
        onClose={() => {
          setDraftLocation(location || draftLocation);
          setLocationDialogOpen(false);
        }}
        onDefault={useDefaultLocation}
        onLocationChange={updateDraftLocation}
        onMapApiKeyChange={setMapApiKey}
        onSave={saveLocation}
      />
    </main>
  );
}
