import { useEffect, useState } from "react";
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  Sunrise,
  Sunset,
  Sun,
} from "lucide-react";

const STORAGE_KEY = "whatsup.location";
const DEFAULT_TIMEZONE = "UTC";

const WEATHER_CODE_LABELS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

const DAILY_FIELDS = [
  "temperature_2m_max",
  "temperature_2m_min",
  "weather_code",
  "precipitation_sum",
  "wind_speed_10m_max",
  "sunrise",
  "sunset",
].join(",");

function describeWeatherCode(code) {
  return WEATHER_CODE_LABELS[code] || "Unknown conditions";
}

const WEATHER_ICONS = {
  0: Sun,
  1: Sun,
  2: CloudSun,
  3: Cloud,
  45: CloudFog,
  48: CloudFog,
  51: CloudDrizzle,
  53: CloudDrizzle,
  55: CloudDrizzle,
  56: CloudDrizzle,
  57: CloudDrizzle,
  61: CloudRain,
  63: CloudRain,
  65: CloudRain,
  66: CloudRain,
  67: CloudRain,
  71: CloudSnow,
  73: CloudSnow,
  75: CloudSnow,
  77: CloudSnow,
  80: CloudRain,
  81: CloudRain,
  82: CloudRain,
  85: CloudSnow,
  86: CloudSnow,
  95: CloudLightning,
  96: CloudLightning,
  99: CloudLightning,
};

function WeatherGlyph({ code, className }) {
  const Icon = WEATHER_ICONS[code] || Cloud;
  return <Icon className={className} aria-hidden="true" />;
}

function loadStoredLocation() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function formatTime(iso, timezone) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: timezone || DEFAULT_TIMEZONE,
      timeZoneName: "short",
    }).format(date);
  } catch {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }
}

export default function WeatherForecast({ location }) {
  const source = location || loadStoredLocation();
  const latitude = Number(source?.latitude);
  const longitude = Number(source?.longitude);
  const timezone = source?.timezone || DEFAULT_TIMEZONE;
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasCoordinates) return undefined;

    let ignore = false;
    Promise.resolve().then(() => {
      if (ignore) return;
      setLoading(true);
      setError("");
    });

    const params = [
      `latitude=${encodeURIComponent(latitude.toFixed(4))}`,
      `longitude=${encodeURIComponent(longitude.toFixed(4))}`,
      `daily=${encodeURIComponent(DAILY_FIELDS)}`,
      `timezone=${encodeURIComponent(timezone)}`,
      "forecast_days=1",
    ].join("&");
    const url = `https://api.open-meteo.com/v1/forecast?${params}`;

    fetch(url)
      .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
      .then(({ ok, data }) => {
        if (ignore) return;
        if (!ok || data?.error) {
          setError(data?.reason || "Unable to fetch forecast.");
          setForecast(null);
          return;
        }
        setForecast(data);
      })
      .catch((fetchError) => {
        if (ignore) return;
        setError(fetchError?.message || "Unable to fetch forecast.");
        setForecast(null);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [latitude, longitude, timezone, hasCoordinates]);

  if (!hasCoordinates) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <div className="flex items-center gap-2 font-medium text-slate-950">
        <WeatherGlyph code={null} className="h-4 w-4 text-amber-500" />
        Today&apos;s weather
      </div>
      {loading ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Fetching forecast...
        </div>
      ) : error ? (
        <div className="mt-2 text-xs text-red-700">{error}</div>
      ) : forecast ? (
        <CompactForecast forecast={forecast} timezone={timezone} />
      ) : null}
    </div>
  );
}

function CompactForecast({ forecast, timezone }) {
  const daily = forecast.daily || {};
  const code = daily.weather_code?.[0];
  const maxTemp = daily.temperature_2m_max?.[0];
  const minTemp = daily.temperature_2m_min?.[0];
  const precipitation = daily.precipitation_sum?.[0];
  const wind = daily.wind_speed_10m_max?.[0];
  const sunrise = daily.sunrise?.[0];
  const sunset = daily.sunset?.[0];

  const tempUnit = forecast.daily_units?.temperature_2m_max || "°C";
  const precipUnit = forecast.daily_units?.precipitation_sum || "mm";
  const windUnit = forecast.daily_units?.wind_speed_10m_max || "km/h";

  return (
    <>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <WeatherGlyph code={code} className="h-3.5 w-3.5 text-amber-500" />
        <span className="font-medium text-slate-900">{describeWeatherCode(code)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-slate-900">
          {Number.isFinite(maxTemp) && Number.isFinite(minTemp)
            ? `${maxTemp.toFixed(0)}${tempUnit} / ${minTemp.toFixed(0)}${tempUnit}`
            : "—"}
        </span>
        <span className="text-slate-500">
          {Number.isFinite(precipitation) ? `${precipitation.toFixed(1)}${precipUnit}` : "—"} ·{" "}
          {Number.isFinite(wind) ? `${wind.toFixed(0)}${windUnit}` : "—"}
        </span>
      </div>
      {(sunrise || sunset) && (
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
          <Sunrise className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{formatTime(sunrise, timezone) || "—"}</span>
          <Sunset className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
          <span>{formatTime(sunset, timezone) || "—"}</span>
        </div>
      )}
    </>
  );
}
