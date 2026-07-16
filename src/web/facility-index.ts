import { readFileSync } from "node:fs";

export type Facility = {
  address: string;
  category: string;
  district: string;
  latitude: number;
  longitude: number;
  alternateNames?: string[];
  metroLines?: string[];
  name: string;
  sourceLocations?: Array<{ latitude: number; longitude: number }>;
  stationLocations?: Array<{ latitude: number; longitude: number }>;
};

export type NearbyFacility = Facility & { distanceMeters: number };

export type NearbyFacilityGroup = {
  category: string;
  places: NearbyFacility[];
};

/** Read the exported, GCJ-02 facility catalogue and prepare it for proximity lookup. */
export function loadFacilityIndex(csvPath: string): Facility[] {
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  const [headers, ...dataRows] = rows;

  if (!headers) throw new Error("Facility catalogue is empty.");

  const fieldIndex = new Map(headers.map((header, index) => [header, index]));
  const field = (row: string[], name: string): string => row[fieldIndex.get(name) ?? -1] ?? "";

  const rawFacilities = dataRows.map((row) => ({
    address: field(row, "address"),
    category: field(row, "category"),
    district: field(row, "district"),
    latitude: Number(field(row, "latitude")),
    longitude: Number(field(row, "longitude")),
    name: field(row, "name"),
    verificationNote: field(row, "verification_note"),
  })).filter((facility) => (
    facility.name.length > 0
    && Number.isFinite(facility.latitude)
    && Number.isFinite(facility.longitude)
  ));

  const facilities = mergeCommunityCivicServiceCenters(mergeMetroStations(rawFacilities));
  if (facilities.length === 0) throw new Error("Facility catalogue contains no valid coordinates.");
  return facilities;
}

export function findNearestFacilities(
  facilities: Facility[],
  origin: { latitude: number; longitude: number },
  limit = 3,
): NearbyFacility[] {
  return facilities
    .map((facility) => ({
      ...facility,
      distanceMeters: Math.round(Math.min(...(facility.sourceLocations ?? facility.stationLocations ?? [facility])
        .map((location) => haversineMeters(origin, location)))),
    }))
    .sort((left, right) => left.distanceMeters - right.distanceMeters)
    .slice(0, limit);
}

function mergeMetroStations(facilities: Array<Facility & { verificationNote: string }>): Facility[] {
  const mergedStations = new Map<string, Facility>();
  const otherFacilities: Facility[] = [];

  for (const facility of facilities) {
    if (facility.category !== "transit.metro_station") {
      otherFacilities.push(stripVerificationNote(facility));
      continue;
    }

    const stationKey = normalizeMetroName(facility.name);
    const existing = mergedStations.get(stationKey);
    const location = { latitude: facility.latitude, longitude: facility.longitude };
    if (!existing) {
      mergedStations.set(stationKey, {
        ...stripVerificationNote(facility),
        metroLines: extractMetroLines(facility.verificationNote),
        stationLocations: [location],
      });
      continue;
    }

    existing.metroLines = sortMetroLines([...(existing.metroLines ?? []), ...extractMetroLines(facility.verificationNote)]);
    const locations = existing.stationLocations ?? [];
    if (!locations.some((item) => item.latitude === location.latitude && item.longitude === location.longitude)) {
      locations.push(location);
    }
    existing.stationLocations = locations;
  }

  return [...otherFacilities, ...mergedStations.values()];
}

/** Merge co-located community culture and party service centres into one searchable place. */
function mergeCommunityCivicServiceCenters(facilities: Facility[]): Facility[] {
  const centres: Facility[] = [];
  const otherFacilities: Facility[] = [];

  for (const facility of facilities) {
    if (facility.category !== "community.civic_service_center") {
      otherFacilities.push(facility);
      continue;
    }

    const existing = centres.find((candidate) => isSameCommunityCentre(candidate, facility));
    const location = { latitude: facility.latitude, longitude: facility.longitude };
    if (!existing) {
      centres.push({
        ...facility,
        alternateNames: [facility.name],
        sourceLocations: [location],
      });
      continue;
    }

    existing.alternateNames = uniqueNames([...(existing.alternateNames ?? [existing.name]), facility.name]);
    const sourceLocations = existing.sourceLocations ?? [{ latitude: existing.latitude, longitude: existing.longitude }];
    if (!sourceLocations.some((item) => item.latitude === location.latitude && item.longitude === location.longitude)) {
      sourceLocations.push(location);
    }
    existing.sourceLocations = sourceLocations;
  }

  return [...otherFacilities, ...centres];
}

function isSameCommunityCentre(first: Facility, second: Facility): boolean {
  const firstAddress = normalizeAddress(first.address);
  const secondAddress = normalizeAddress(second.address);
  if (firstAddress.length > 0 && firstAddress === secondAddress) return true;

  const firstLocations = first.sourceLocations ?? [{ latitude: first.latitude, longitude: first.longitude }];
  return firstLocations.some((location) => haversineMeters(location, second) <= 80);
}

function normalizeAddress(address: string): string {
  return address.replace(/[\s,，、;；()（）]/g, "").toLocaleLowerCase("zh-CN");
}

function uniqueNames(names: string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function stripVerificationNote(facility: Facility & { verificationNote: string }): Facility {
  const { verificationNote: _verificationNote, ...facilityRecord } = facility;
  return facilityRecord;
}

function normalizeMetroName(name: string): string {
  return name.replace(/[\s（）()]/g, "").toLocaleLowerCase("zh-CN");
}

function extractMetroLines(verificationNote: string): string[] {
  const query = verificationNote.match(/query:\s*(.*)$/)?.[1] ?? "";
  return sortMetroLines(query.split("|").map((value) => metroLineLabel(value.trim())).filter(Boolean));
}

function metroLineLabel(lineName: string): string {
  const numberedLine = lineName.match(/地铁\s*(\d+)\s*号线/);
  if (numberedLine) return `${numberedLine[1]}号线`;
  if (/磁浮|磁悬浮/.test(lineName)) return "磁浮线";
  if (/浦江/.test(lineName)) return "浦江线";
  if (/机场联络|市域机场/.test(lineName)) return "机场联络线";
  return lineName;
}

function sortMetroLines(lines: string[]): string[] {
  return [...new Set(lines)].sort((left, right) => {
    const leftNumber = Number(left.match(/^(\d+)号线$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
    const rightNumber = Number(right.match(/^(\d+)号线$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
    return leftNumber - rightNumber || left.localeCompare(right, "zh-CN");
  });
}

/** Return the closest facilities independently for every catalogue category. */
export function findNearestFacilitiesByCategory(
  facilities: Facility[],
  origin: { latitude: number; longitude: number },
  limitPerCategory = 3,
): NearbyFacilityGroup[] {
  const groups = new Map<string, Facility[]>();
  for (const facility of facilities) {
    const category = displayCategoryFor(facility.category);
    const categoryFacilities = groups.get(category) ?? [];
    categoryFacilities.push(facility);
    groups.set(category, categoryFacilities);
  }

  return [...groups.entries()]
    .sort(([left], [right]) => categorySortOrder(left) - categorySortOrder(right))
    .map(([category, categoryFacilities]) => ({
      category,
      places: findNearestFacilities(categoryFacilities, origin, limitPerCategory),
    }));
}

function displayCategoryFor(sourceCategory: string): string {
  if (sourceCategory.startsWith("library.")) return "library.all";
  if (sourceCategory === "hospital.tertiary_a") return "medical.tertiary_a";
  if (sourceCategory === "hospital.secondary_a" || sourceCategory.startsWith("primary_care.")) {
    return "medical.other";
  }
  return sourceCategory;
}

function categorySortOrder(category: string): number {
  return [
    "culture.museum",
    "culture.art_gallery",
    "culture.concert_hall",
    "library.all",
    "community.civic_service_center",
    "transit.metro_station",
    "transport.railway_station",
    "transport.airport",
    "park.major_city_park",
    "park.neighborhood_park",
    "medical.tertiary_a",
    "medical.other",
    "commerce.big_box_retail",
    "commerce.large_mall",
    "landmark.city_landmark",
  ].indexOf(category);
}

export function haversineMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const toRadians = (degrees: number): number => degrees * Math.PI / 180;
  const dLat = toRadians(second.latitude - first.latitude);
  const dLng = toRadians(second.longitude - first.longitude);
  const latitudeA = toRadians(first.latitude);
  const latitudeB = toRadians(second.latitude);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(dLng / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  row.push(field);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}
