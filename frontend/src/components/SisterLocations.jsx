import { useEffect, useMemo, useRef, useState } from "react";
import { Chart } from "chart.js";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  Plus,
  RefreshCw,
  Sun,
  Trash2,
} from "lucide-react";

import {
  MAX_SISTER_LOCATIONS,
  loadSisterLocations,
  newSisterLocation,
  saveSisterLocations,
  validateSisterLocations,
} from "../sisterLocations.js";

const palette = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ca8a04", "#0891b2"];
const WEATHER_CURRENT_FIELDS =
  "temperature_2m,weather_code,precipitation,wind_speed_10m";
const WEATHER_LABELS = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  95: "Thunderstorm",
  96: "Thunderstorm",
  99: "Thunderstorm",
};

function roundedUtcHour() {
  const date = new Date();
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString().slice(0, 16);
}

function utcInputToIso(value) {
  return new Date(`${value}:00Z`).toISOString();
}

function formatUtcTime(value) {
  return new Date(value).toLocaleString([], {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function sourcePayload(source) {
  if ((source?.provider || "builtin") === "builtin") {
    return { source_name: source.name };
  }
  return {
    source: {
      name: source.name,
      ra: source.ra,
      dec: source.dec,
      provider: source.provider,
      catalog: source.catalog || "",
    },
  };
}

function WeatherIcon({ code }) {
  let Icon = Cloud;
  if (code === 0 || code === 1) Icon = Sun;
  else if (code === 2) Icon = CloudSun;
  else if (code === 45 || code === 48) Icon = CloudFog;
  else if ([51, 53, 55].includes(code)) Icon = CloudDrizzle;
  else if ([61, 63, 65, 80, 81, 82].includes(code)) Icon = CloudRain;
  else if ([71, 73, 75].includes(code)) Icon = CloudSnow;
  else if ([95, 96, 99].includes(code)) Icon = CloudLightning;
  return <Icon className="h-4 w-4 text-amber-500" aria-hidden="true" />;
}

function weatherUrl(locations) {
  const latitude = locations.map((location) => location.latitude).join(",");
  const longitude = locations.map((location) => location.longitude).join(",");
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: WEATHER_CURRENT_FIELDS,
    timezone: "UTC",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

function weatherRecord(response) {
  const current = response.current || {};
  const units = response.current_units || {};
  return {
    status: "ready",
    code: current.weather_code,
    temperature: current.temperature_2m,
    precipitation: current.precipitation,
    wind: current.wind_speed_10m,
    temperatureUnit: units.temperature_2m || "°C",
    precipitationUnit: units.precipitation || "mm",
    windUnit: units.wind_speed_10m || "km/h",
  };
}

async function fetchWeather(locations) {
  try {
    const response = await fetch(weatherUrl(locations));
    const data = await response.json();
    if (!response.ok || data?.error) throw new Error(data?.reason || "Weather unavailable");
    const results = Array.isArray(data) ? data : [data];
    if (results.length !== locations.length) throw new Error("Incomplete weather response");
    return Object.fromEntries(
      locations.map((location, index) => [location.id, weatherRecord(results[index])]),
    );
  } catch {
    const entries = await Promise.all(
      locations.map(async (location) => {
        try {
          const response = await fetch(weatherUrl([location]));
          const data = await response.json();
          if (!response.ok || data?.error) throw new Error();
          return [location.id, weatherRecord(data)];
        } catch {
          return [location.id, { status: "error" }];
        }
      }),
    );
    return Object.fromEntries(entries);
  }
}

function SisterChart({ datasets, loading }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const config = useMemo(() => {
    if (!datasets.length) return null;
    const allTimes = datasets.flatMap((dataset) =>
      dataset.points.map((point) => Date.parse(point.time)),
    );
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);
    const lines = datasets.map((dataset, index) => ({
      label: dataset.location.name,
      data: dataset.points.map((point) => ({
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
    lines.push({
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
      type: "line",
      data: { datasets: lines },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "nearest" },
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 10, usePointStyle: true },
          },
          tooltip: {
            callbacks: {
              title: (items) => formatUtcTime(items[0].raw.time || items[0].raw.x),
              label: (context) => {
                if (context.dataset.label === "Horizon") return "Horizon: 0.00 deg";
                return `${context.dataset.label}: El ${context.raw.y.toFixed(2)} deg, Az ${context.raw.azimuth.toFixed(2)} deg`;
              },
            },
          },
        },
        scales: {
          x: {
            type: "linear",
            title: { display: true, text: "Time (UTC)" },
            grid: { color: "#e2e8f0" },
            ticks: {
              callback: (value) => formatUtcTime(Number(value)),
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
  }, [datasets]);

  useEffect(() => {
    if (!config) {
      chartRef.current?.destroy();
      chartRef.current = null;
      return undefined;
    }
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [config]);

  if (!config) {
    return (
      <div className="flex min-h-[460px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
        {loading
          ? "Calculating the 12-hour comparison..."
          : "Update the comparison to plot this source at each location."}
      </div>
    );
  }

  return (
    <div className="min-h-[460px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <canvas ref={canvasRef} className="h-[460px] w-full" />
    </div>
  );
}

function WeatherSummary({ location, weather }) {
  return (
    <div className="border-l-2 border-slate-200 pl-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-slate-950">
        <WeatherIcon code={weather?.code} />
        {location.name}
      </div>
      {!weather ? (
        <div className="mt-1 text-xs text-slate-500">Update to load weather</div>
      ) : weather.status === "loading" ? (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Fetching weather
        </div>
      ) : weather.status === "error" ? (
        <div className="mt-1 text-xs text-slate-500">Weather unavailable</div>
      ) : (
        <>
          <div className="mt-1 text-xs font-medium text-slate-700">
            {WEATHER_LABELS[weather.code] || "Current conditions"} ·{" "}
            {Number.isFinite(weather.temperature)
              ? `${weather.temperature.toFixed(0)}${weather.temperatureUnit}`
              : "—"}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Rain{" "}
            {Number.isFinite(weather.precipitation)
              ? `${weather.precipitation.toFixed(1)}${weather.precipitationUnit}`
              : "—"}{" "}
            · Wind{" "}
            {Number.isFinite(weather.wind)
              ? `${weather.wind.toFixed(0)}${weather.windUnit}`
              : "—"}
          </div>
        </>
      )}
    </div>
  );
}

export default function SisterLocations({
  allSources,
  selectedSourceKey,
  selectedSource,
  onSelectedSourceChange,
  navigation,
}) {
  const [locations, setLocations] = useState(loadSisterLocations);
  const [startTime, setStartTime] = useState(roundedUtcHour);
  const [datasets, setDatasets] = useState([]);
  const [weather, setWeather] = useState({});
  const [locationErrors, setLocationErrors] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function updateComparison(event) {
    event?.preventDefault();
    setError("");
    const validationErrors = validateSisterLocations(locations);
    setLocationErrors(validationErrors);
    if (validationErrors.length) return;
    if (!selectedSource) {
      setError("Select a source before updating the comparison.");
      return;
    }
    if (!startTime || Number.isNaN(Date.parse(`${startTime}:00Z`))) {
      setError("Enter a valid UTC start time.");
      return;
    }

    const savedLocations = saveSisterLocations(locations);
    setLocations(savedLocations);
    setLoading(true);
    setWeather(
      Object.fromEntries(savedLocations.map((location) => [location.id, { status: "loading" }])),
    );

    const weatherPromise = fetchWeather(savedLocations).then(setWeather);
    try {
      const response = await fetch("/api/sister-trajectories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...sourcePayload(selectedSource),
          locations: savedLocations.map(({ name, latitude, longitude, altitude }) => ({
            name,
            latitude,
            longitude,
            altitude,
          })),
          start_time: utcInputToIso(startTime),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || "Unable to calculate the location comparison.");
      }
      setDatasets(result.datasets || []);
      setLocationErrors(
        (result.errors || []).map(
          (item) => `${item.location?.name || `Location ${item.index + 1}`}: ${item.detail}`,
        ),
      );
      if (!result.datasets?.length) {
        setError("No trajectories could be calculated.");
      }
    } catch (nextError) {
      setDatasets([]);
      setError(nextError.message || "Unable to calculate the location comparison.");
    } finally {
      setLoading(false);
      await weatherPromise;
    }
  }

  function updateLocation(id, field, value) {
    setLocations((current) =>
      current.map((location) =>
        location.id === id
          ? {
              ...location,
              [field]: field === "name" ? value : value,
            }
          : location,
      ),
    );
  }

  function removeLocation(id) {
    setLocations((current) => current.filter((location) => location.id !== id));
  }

  function addLocation() {
    if (locations.length >= MAX_SISTER_LOCATIONS) return;
    setLocations((current) => [...current, newSisterLocation()]);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 antialiased">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-6">
          {navigation}
          <div className="mt-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                WhatsUp
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Sister locations
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Compare one source across a fixed 12-hour window at up to six observing
                sites.
              </p>
            </div>
            <form
              className="grid w-full gap-3 sm:grid-cols-2 lg:w-auto lg:min-w-[560px]"
              onSubmit={updateComparison}
            >
              <label className="text-sm font-medium text-slate-700">
                Source
                <select
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  value={selectedSourceKey}
                  onChange={(event) => onSelectedSourceChange(event.target.value)}
                >
                  {allSources.map((source) => (
                    <option
                      key={`${source.provider || "builtin"}:${source.catalog || ""}:${source.name}:${source.ra}`}
                      value={
                        (source.provider || "builtin") === "builtin"
                          ? `builtin:${source.name}`
                          : `${source.provider}:${source.catalog || ""}:${source.name}:${source.ra}:${source.dec}`
                      }
                    >
                      {source.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Start time UTC
                <input
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  type="datetime-local"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                />
              </label>
              <button
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:col-span-2"
                disabled={loading || !selectedSource}
              >
                <span className="inline-flex items-center gap-2">
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {loading ? "Updating comparison..." : "Update comparison"}
                </span>
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-5 px-5 py-6">
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Comparison locations</h2>
              <p className="mt-1 text-xs text-slate-500">
                Changes are saved in this browser when the comparison is updated.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
              disabled={locations.length >= MAX_SISTER_LOCATIONS}
              onClick={addLocation}
            >
              <Plus className="h-4 w-4" />
              Add location
            </button>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_44px] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <div>Name</div>
                <div>Latitude</div>
                <div>Longitude</div>
                <div>Altitude (m)</div>
                <div />
              </div>
              <div className="divide-y divide-slate-100">
                {locations.map((location) => (
                  <div
                    key={location.id}
                    className="grid grid-cols-[1.4fr_1fr_1fr_1fr_44px] gap-3 px-4 py-3"
                  >
                    <input
                      aria-label="Location name"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={location.name}
                      onChange={(event) =>
                        updateLocation(location.id, "name", event.target.value)
                      }
                    />
                    <input
                      aria-label={`${location.name || "Location"} latitude`}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      type="number"
                      min="-90"
                      max="90"
                      step="0.0001"
                      value={location.latitude}
                      onChange={(event) =>
                        updateLocation(location.id, "latitude", event.target.value)
                      }
                    />
                    <input
                      aria-label={`${location.name || "Location"} longitude`}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      type="number"
                      min="-180"
                      max="180"
                      step="0.0001"
                      value={location.longitude}
                      onChange={(event) =>
                        updateLocation(location.id, "longitude", event.target.value)
                      }
                    />
                    <input
                      aria-label={`${location.name || "Location"} altitude`}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      type="number"
                      step="1"
                      value={location.altitude}
                      onChange={(event) =>
                        updateLocation(location.id, "altitude", event.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="flex items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                      aria-label={`Remove ${location.name || "location"}`}
                      disabled={locations.length === 1}
                      onClick={() => removeLocation(location.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {(error || locationErrors.length > 0) && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error && <div>{error}</div>}
            {locationErrors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Current weather</h2>
            <p className="mt-1 text-xs text-slate-500">
              A compact live snapshot; weather availability does not affect the plot.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {locations.map((location) => (
              <WeatherSummary
                key={location.id}
                location={location}
                weather={weather[location.id]}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Source elevation by location</h2>
            <p className="mt-1 text-sm text-slate-600">
              {selectedSource
                ? `${selectedSource.name}, hourly from ${formatUtcTime(utcInputToIso(startTime))}`
                : "Select a source to compare."}
            </p>
          </div>
          <div className="text-sm text-slate-500">
            {datasets.length}/{locations.length} locations plotted
          </div>
        </div>

        <SisterChart datasets={datasets} loading={loading} />
      </section>
    </main>
  );
}
