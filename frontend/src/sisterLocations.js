export const SISTER_LOCATIONS_STORAGE_KEY = "whatsup.sisterLocations.v1";
export const MAX_SISTER_LOCATIONS = 6;

export const SISTER_LOCATION_PRESETS = [
  {
    id: "meerkat",
    name: "MeerKAT",
    latitude: -30.713,
    longitude: 21.443,
    altitude: 1086,
  },
  {
    id: "vla",
    name: "VLA",
    latitude: 34.0784,
    longitude: -107.6184,
    altitude: 2124,
  },
  {
    id: "hartrao",
    name: "HartRAO",
    latitude: -25.8897,
    longitude: 27.6854,
    altitude: 1415,
  },
  {
    id: "effelsberg",
    name: "Effelsberg",
    latitude: 50.5248,
    longitude: 6.8836,
    altitude: 319,
  },
  {
    id: "murriyang",
    name: "Parkes / Murriyang",
    latitude: -32.9984,
    longitude: 148.2637,
    altitude: 415,
  },
];

export function newSisterLocation() {
  return {
    id: `location-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    latitude: "",
    longitude: "",
    altitude: "",
  };
}

export function validateSisterLocations(locations) {
  if (!Array.isArray(locations) || locations.length < 1) {
    return ["Add at least one location."];
  }
  if (locations.length > MAX_SISTER_LOCATIONS) {
    return [`A maximum of ${MAX_SISTER_LOCATIONS} locations is allowed.`];
  }

  const errors = [];
  locations.forEach((location, index) => {
    const label = location?.name?.trim() || `Location ${index + 1}`;
    const latitudeMissing = location?.latitude === "" || location?.latitude == null;
    const longitudeMissing = location?.longitude === "" || location?.longitude == null;
    const altitudeMissing = location?.altitude === "" || location?.altitude == null;
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    const altitude = Number(location?.altitude);

    if (!location?.id) errors.push(`${label} is missing an identifier.`);
    if (!location?.name?.trim()) errors.push(`Location ${index + 1} needs a name.`);
    if (latitudeMissing || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      errors.push(`${label} needs a latitude from -90 to 90.`);
    }
    if (
      longitudeMissing ||
      !Number.isFinite(longitude) ||
      longitude < -180 ||
      longitude > 180
    ) {
      errors.push(`${label} needs a longitude from -180 to 180.`);
    }
    if (altitudeMissing || !Number.isFinite(altitude)) {
      errors.push(`${label} needs a numeric altitude.`);
    }
  });
  return errors;
}

export function normaliseSisterLocations(locations) {
  return locations.map((location) => ({
    id: String(location.id),
    name: location.name.trim(),
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    altitude: Number(location.altitude),
  }));
}

export function loadSisterLocations(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage.getItem(SISTER_LOCATIONS_STORAGE_KEY));
    if (validateSisterLocations(parsed).length) throw new Error("Invalid stored locations");
    const migrated = parsed.map((location) =>
      location.id === "alma" &&
      location.name === "ALMA" &&
      Number(location.latitude) === -23.029 &&
      Number(location.longitude) === -67.755 &&
      Number(location.altitude) === 5050
        ? { ...SISTER_LOCATION_PRESETS.find((preset) => preset.id === "hartrao") }
        : location,
    );
    const normalised = normaliseSisterLocations(migrated);
    if (migrated.some((location, index) => location !== parsed[index])) {
      storage.setItem(SISTER_LOCATIONS_STORAGE_KEY, JSON.stringify(normalised));
    }
    return normalised;
  } catch {
    return SISTER_LOCATION_PRESETS.map((location) => ({ ...location }));
  }
}

export function saveSisterLocations(locations, storage = globalThis.localStorage) {
  const normalised = normaliseSisterLocations(locations);
  storage.setItem(SISTER_LOCATIONS_STORAGE_KEY, JSON.stringify(normalised));
  return normalised;
}
