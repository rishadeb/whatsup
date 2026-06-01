const { useEffect, useMemo, useRef, useState } = React;
const h = React.createElement;

const STORAGE_KEY = "whatsup.location";
const plotModes = ["Az/El", "Az/time", "El/time", "All"];
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

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function loadStoredLocation() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function numberInputValue(value) {
  return Number.isFinite(Number(value)) ? value : "";
}

function ChartPanel({ plotMode, plotData }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  const chartConfig = useMemo(() => {
    if (!plotData) return null;

    if (plotMode === "All") {
      if (!Array.isArray(plotData.datasets)) return null;
      return {
        type: "scatter",
        data: {
          datasets: plotData.datasets.map((dataset, index) => ({
            label: dataset.source.name,
            data: dataset.points.map((point) => ({
              x: point.azimuth,
              y: point.elevation,
            })),
            pointRadius: 3,
            pointHoverRadius: 5,
            borderColor: palette[index % palette.length],
            backgroundColor: palette[index % palette.length],
          })).concat([
            {
              label: "Horizon",
              data: [
                { x: 0, y: 0 },
                { x: 360, y: 0 },
              ],
              showLine: true,
              pointRadius: 0,
              borderDash: [6, 6],
              borderColor: "#334155",
            },
          ]),
        },
        options: scatterOptions("Azimuth (degrees)", "Elevation (degrees)"),
      };
    }

    if (!Array.isArray(plotData.points)) return null;

    if (plotMode === "Az/El") {
      return {
        type: "scatter",
        data: {
          datasets: [
            {
              label: plotData.source.name,
              data: plotData.points.map((point) => ({
                x: point.azimuth,
                y: point.elevation,
              })),
              pointRadius: 5,
              pointHoverRadius: 7,
              borderColor: "#2563eb",
              backgroundColor: "#2563eb",
            },
            {
              label: "Horizon",
              data: [
                { x: 0, y: 0 },
                { x: 360, y: 0 },
              ],
              showLine: true,
              pointRadius: 0,
              borderDash: [6, 6],
              borderColor: "#334155",
            },
          ],
        },
        options: scatterOptions("Azimuth (degrees)", "Elevation (degrees)"),
      };
    }

    const key = plotMode === "Az/time" ? "azimuth" : "elevation";
    const label = plotMode === "Az/time" ? "Azimuth (degrees)" : "Elevation (degrees)";
    return {
      type: "line",
      data: {
        labels: plotData.points.map((point) => formatTime(point.time)),
        datasets: [
          {
            label: `${plotData.source.name} ${key}`,
            data: plotData.points.map((point) => point[key]),
            tension: 0.25,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderColor: "#2563eb",
            backgroundColor: "#2563eb",
          },
        ],
      },
      options: lineOptions("Time", label),
    };
  }, [plotMode, plotData]);

  useEffect(() => {
    if (!chartConfig) {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
      return;
    }
    if (!canvasRef.current) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }
    chartRef.current = new Chart(canvasRef.current, chartConfig);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [chartConfig]);

  if (!chartConfig) {
    return h(
      "div",
      { className: "flex min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500 shadow-sm" },
      "Calculating plot..."
    );
  }

  return h(
    "div",
    { className: "min-h-[420px] rounded-lg border border-slate-200 bg-white p-4 shadow-sm" },
    h("canvas", { ref: canvasRef, className: "h-[420px] w-full" })
  );
}

function scatterOptions(xTitle, yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { boxWidth: 10, usePointStyle: true },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const point = context.raw;
            return `${context.dataset.label}: ${point.x.toFixed(2)}, ${point.y.toFixed(2)}`;
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: xTitle },
        grid: { color: "#e2e8f0" },
      },
      y: {
        title: { display: true, text: yTitle },
        grid: { color: "#e2e8f0" },
      },
    },
  };
}

function lineOptions(xTitle, yTitle) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: {
        title: { display: true, text: xTitle },
        grid: { color: "#e2e8f0" },
      },
      y: {
        title: { display: true, text: yTitle },
        grid: { color: "#e2e8f0" },
      },
    },
  };
}

function Field({ label, children }) {
  return h(
    "label",
    { className: "block text-sm font-medium text-slate-700" },
    label,
    h("div", { className: "mt-1" }, children)
  );
}

function TextInput(props) {
  return h("input", {
    ...props,
    className: classNames(
      "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
      props.className
    ),
  });
}

function Select(props) {
  return h("select", {
    ...props,
    className: classNames(
      "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
      props.className
    ),
  });
}

function App() {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState("");
  const [plotMode, setPlotMode] = useState("Az/El");
  const [durationHours, setDurationHours] = useState(10);
  const [stepMinutes, setStepMinutes] = useState(30);
  const [location, setLocation] = useState(loadStoredLocation());
  const [draftLocation, setDraftLocation] = useState(loadStoredLocation());
  const [plotData, setPlotData] = useState(null);
  const [loading, setLoading] = useState(true);
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
    if (!selectedSource || !location) return;
    refreshPlot();
  }, [selectedSource, plotMode, durationHours, stepMinutes, location]);

  async function refreshPlot() {
    setLoading(true);
    setError("");
    setPlotData(null);

    const payload = {
      duration_hours: Number(durationHours),
      step_minutes: Number(stepMinutes),
      location,
    };
    const url = plotMode === "All" ? "/api/trajectories" : "/api/trajectory";
    const body = plotMode === "All" ? payload : { ...payload, source_name: selectedSource };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const nextData = await response.json();
      if (!response.ok) {
        throw new Error(nextData.detail || "Unable to calculate trajectory.");
      }
      setPlotData(nextData);
    } catch (nextError) {
      setError(nextError.message || "Unable to calculate trajectory.");
    } finally {
      setLoading(false);
    }
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
    setLocation(draftLocation);
  }

  function useDefaultLocation() {
    fetch("/api/location/default")
      .then((response) => response.json())
      .then((defaultLocation) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultLocation));
        setDraftLocation(defaultLocation);
        setLocation(defaultLocation);
      })
      .catch((nextError) => setError(nextError.message || "Unable to load default location."));
  }

  const selectedSourceDetails = sources.find((source) => source.name === selectedSource);
  const points = plotMode === "All"
    ? plotData?.datasets?.reduce((total, dataset) => total + dataset.points.length, 0)
    : plotData?.points?.length;

  return h(
    "main",
    { className: "min-h-screen" },
    h(
      "section",
      { className: "border-b border-slate-200 bg-white" },
      h(
        "div",
        { className: "mx-auto flex max-w-7xl flex-col gap-6 px-5 py-6 lg:flex-row lg:items-end lg:justify-between" },
        h(
          "div",
          null,
          h("p", { className: "text-sm font-semibold uppercase tracking-wide text-blue-700" }, "WhatsUp"),
          h("h1", { className: "mt-2 text-3xl font-semibold tracking-tight text-slate-950" }, "Astronomical source positions"),
          h("p", { className: "mt-2 max-w-2xl text-sm leading-6 text-slate-600" }, "Plot azimuth and elevation for catalogued radio sources from the observing location stored in this browser.")
        ),
        h(
          "div",
          { className: "rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700" },
          h("div", { className: "font-medium text-slate-950" }, location?.name || "No location selected"),
          h("div", null, location ? `${location.latitude}, ${location.longitude} at ${location.altitude} m` : "Load or save a location")
        )
      )
    ),
    h(
      "section",
      { className: "mx-auto grid max-w-7xl gap-5 px-5 py-6 lg:grid-cols-[310px_1fr]" },
      h(
        "aside",
        { className: "space-y-5" },
        h(
          "div",
          { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm" },
          h("h2", { className: "text-base font-semibold text-slate-950" }, "Plot controls"),
          h(
            "div",
            { className: "mt-4 space-y-4" },
            h(
              Field,
              { label: "Source" },
              h(
                Select,
                {
                  value: selectedSource,
                  onChange: (event) => setSelectedSource(event.target.value),
                  disabled: plotMode === "All",
                },
                sources.map((source) => h("option", { key: source.name, value: source.name }, source.name))
              )
            ),
            h(
              Field,
              { label: "Plot" },
              h(
                Select,
                { value: plotMode, onChange: (event) => setPlotMode(event.target.value) },
                plotModes.map((mode) => h("option", { key: mode, value: mode }, mode))
              )
            ),
            h(
              "div",
              { className: "grid grid-cols-2 gap-3" },
              h(
                Field,
                { label: "Hours" },
                h(TextInput, {
                  type: "number",
                  min: "0.5",
                  max: "60",
                  step: "0.5",
                  value: numberInputValue(durationHours),
                  onChange: (event) => setDurationHours(event.target.value),
                })
              ),
              h(
                Field,
                { label: "Step minutes" },
                h(TextInput, {
                  type: "number",
                  min: "1",
                  step: "1",
                  value: numberInputValue(stepMinutes),
                  onChange: (event) => setStepMinutes(event.target.value),
                })
              )
            ),
            h(
              "button",
              {
                className: "w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300",
                onClick: refreshPlot,
                disabled: loading || !location,
              },
              loading ? "Calculating..." : "Update plot"
            )
          )
        ),
        h(
          "form",
          { className: "rounded-lg border border-slate-200 bg-white p-4 shadow-sm", onSubmit: saveLocation },
          h("h2", { className: "text-base font-semibold text-slate-950" }, "Observing location"),
          h(
            "div",
            { className: "mt-4 space-y-4" },
            h(
              Field,
              { label: "Name" },
              h(TextInput, {
                value: draftLocation?.name || "",
                onChange: (event) => updateDraftLocation("name", event.target.value),
                required: true,
              })
            ),
            h(
              "div",
              { className: "grid grid-cols-2 gap-3" },
              h(
                Field,
                { label: "Latitude" },
                h(TextInput, {
                  type: "number",
                  step: "0.000001",
                  min: "-90",
                  max: "90",
                  value: numberInputValue(draftLocation?.latitude),
                  onChange: (event) => updateDraftLocation("latitude", event.target.value),
                  required: true,
                })
              ),
              h(
                Field,
                { label: "Longitude" },
                h(TextInput, {
                  type: "number",
                  step: "0.000001",
                  min: "-180",
                  max: "180",
                  value: numberInputValue(draftLocation?.longitude),
                  onChange: (event) => updateDraftLocation("longitude", event.target.value),
                  required: true,
                })
              )
            ),
            h(
              Field,
              { label: "Altitude metres" },
              h(TextInput, {
                type: "number",
                step: "1",
                value: numberInputValue(draftLocation?.altitude),
                onChange: (event) => updateDraftLocation("altitude", event.target.value),
                required: true,
              })
            ),
            h(
              "div",
              { className: "flex gap-2" },
              h("button", { className: "flex-1 rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800" }, "Save location"),
              h("button", { type: "button", className: "rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50", onClick: useDefaultLocation }, "Default")
            )
          )
        )
      ),
      h(
        "div",
        { className: "space-y-5" },
        h(
          "div",
          { className: "flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between" },
          h(
            "div",
            null,
            h("h2", { className: "text-lg font-semibold text-slate-950" }, plotMode === "All" ? "All sources" : selectedSource || "Source"),
            h("p", { className: "mt-1 text-sm text-slate-600" }, selectedSourceDetails && plotMode !== "All" ? `RA ${selectedSourceDetails.ra} / Dec ${selectedSourceDetails.dec}` : "Azimuth and elevation across the requested interval")
          ),
          h(
            "div",
            { className: "text-sm text-slate-600" },
            points ? `${points} calculated points` : "Waiting for data"
          )
        ),
        error && h("div", { className: "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" }, error),
        h(ChartPanel, { plotMode, plotData }),
        plotData && plotMode !== "All" && h(
          "div",
          { className: "overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" },
          h(
            "table",
            { className: "min-w-full divide-y divide-slate-200 text-sm" },
            h(
              "thead",
              { className: "bg-slate-50 text-left text-slate-600" },
              h("tr", null,
                h("th", { className: "px-4 py-3 font-medium" }, "Time"),
                h("th", { className: "px-4 py-3 font-medium" }, "Azimuth"),
                h("th", { className: "px-4 py-3 font-medium" }, "Elevation")
              )
            ),
            h(
              "tbody",
              { className: "divide-y divide-slate-100 text-slate-700" },
              plotData.points.slice(0, 12).map((point) =>
                h("tr", { key: `${point.time}-${point.azimuth}` },
                  h("td", { className: "px-4 py-3" }, new Date(point.time).toLocaleString()),
                  h("td", { className: "px-4 py-3" }, point.azimuth.toFixed(3)),
                  h("td", { className: "px-4 py-3" }, point.elevation.toFixed(3))
                )
              )
            )
          )
        )
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
