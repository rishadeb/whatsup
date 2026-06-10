import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_SISTER_LOCATIONS,
  SISTER_LOCATION_PRESETS,
  SISTER_LOCATIONS_STORAGE_KEY,
  loadSisterLocations,
  saveSisterLocations,
  validateSisterLocations,
} from "./sisterLocations.js";

function storageWith(value) {
  const values = new Map();
  if (value !== undefined) values.set(SISTER_LOCATIONS_STORAGE_KEY, value);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, nextValue) => values.set(key, nextValue),
  };
}

test("first load returns the five global presets", () => {
  const locations = loadSisterLocations(storageWith());
  assert.equal(locations.length, 5);
  assert.deepEqual(
    locations.map((location) => location.name),
    SISTER_LOCATION_PRESETS.map((location) => location.name),
  );
});

test("valid stored locations are restored and normalised", () => {
  const storage = storageWith(
    JSON.stringify([
      { id: "one", name: " Site ", latitude: "10", longitude: "20", altitude: "30" },
    ]),
  );
  assert.deepEqual(loadSisterLocations(storage), [
    { id: "one", name: "Site", latitude: 10, longitude: 20, altitude: 30 },
  ]);
});

test("invalid storage falls back to presets", () => {
  const locations = loadSisterLocations(storageWith("{not json"));
  assert.equal(locations.length, SISTER_LOCATION_PRESETS.length);
});

test("the original ALMA preset migrates to HartRAO", () => {
  const storage = storageWith(
    JSON.stringify([
      { id: "alma", name: "ALMA", latitude: -23.029, longitude: -67.755, altitude: 5050 },
    ]),
  );
  assert.deepEqual(loadSisterLocations(storage), [
    {
      id: "hartrao",
      name: "HartRAO",
      latitude: -25.8897,
      longitude: 27.6854,
      altitude: 1415,
    },
  ]);
});

test("validation enforces coordinates and the maximum", () => {
  const tooMany = Array.from({ length: MAX_SISTER_LOCATIONS + 1 }, (_, index) => ({
    id: String(index),
    name: `Site ${index}`,
    latitude: 0,
    longitude: 0,
    altitude: 0,
  }));
  assert.match(validateSisterLocations(tooMany)[0], /maximum/i);
  assert.match(
    validateSisterLocations([
      { id: "bad", name: "", latitude: 100, longitude: 200, altitude: "" },
    ]).join(" "),
    /name.*latitude.*longitude.*altitude/i,
  );
});

test("saving persists the normalised rows", () => {
  const storage = storageWith();
  const saved = saveSisterLocations(
    [{ id: "one", name: " Site ", latitude: "1", longitude: "2", altitude: "3" }],
    storage,
  );
  assert.deepEqual(loadSisterLocations(storage), saved);
});
