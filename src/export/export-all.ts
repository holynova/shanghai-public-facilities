import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnrichedCultureFacilityRecord } from "../amap/enrich-culture.js";
import type { AmapCollectedFacilityRecord } from "../domain/facility.js";
import type { EnrichedOfficialHospital } from "../amap/enrich-official-hospitals.js";

type ExportRecord = {
  address: string;
  category: string;
  classification_status: string;
  coordinate_system: "GCJ-02" | "";
  district: string;
  latitude: string;
  longitude: string;
  match_confidence: string;
  name: string;
  source_id: string;
  source_url: string;
  verification_note: string;
};

export async function exportAllFacilities(options: {
  amapSnapshot: string;
  cultureSnapshot: string;
  outputSnapshot: string;
}): Promise<{ records: ExportRecord[]; report: object }> {
  const culture = await readJson<EnrichedCultureFacilityRecord[]>(join("data", "interim", options.cultureSnapshot, "culture-enriched.json"));
  const amapFiles = ["amap-metro-lines.json", "amap-primary-care.json", "amap-city-amenities.json"];
  const amap = (await Promise.all(amapFiles.map((file) => readJson<AmapCollectedFacilityRecord[]>(join("data", "interim", options.amapSnapshot, file))))).flat();
  const hospitals = await readJson<EnrichedOfficialHospital[]>(join("data", "interim", options.amapSnapshot, "official-hospitals-enriched.json"));
  const records = [...culture.map(cultureToExport), ...hospitals.map(officialHospitalToExport), ...amap.map(amapToExport)]
    .sort((left, right) => left.category.localeCompare(right.category, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"));
  const byCategory = countBy(records, (record) => record.category);
  const byConfidence = countBy(records, (record) => record.match_confidence || "not_applicable");
  const noCoordinate = records.filter((record) => !record.longitude || !record.latitude).length;
  const report = {
    generatedAt: new Date().toISOString(),
    inputSnapshots: { culture: options.cultureSnapshot, amap: options.amapSnapshot },
    totalRecords: records.length,
    recordsWithCoordinates: records.length - noCoordinate,
    recordsWithoutCoordinates: noCoordinate,
    byCategory,
    byConfidence,
    caveats: [
      "Coordinates are in GCJ-02, as returned by Amap.",
      "Metro stations come from Amap's Shanghai rail line stop sequences, not a POI keyword search; line membership is recorded in verification_note.",
      "Hospital grades in the main CSV come from six Shanghai health authority assessment announcements (2020, 2021, 2023, 2025 and 2026); this is a sourced snapshot, not a claim of a complete current citywide register.",
      "Amap keyword hospital candidates are supplied separately in hospital-grade-candidates-review.csv and are not included in main CSV counts.",
      "Culture records originate from Shanghai municipal culture authority lists and have Amap POI matching confidence.",
    ],
  };
  const directory = join("outputs", options.outputSnapshot);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "shanghai-public-facilities.csv"), toCsv(records), "utf8");
  const hospitalCandidates = await readJson<AmapCollectedFacilityRecord[]>(join("data", "interim", options.amapSnapshot, "amap-hospital.json"));
  await writeFile(join(directory, "hospital-grade-candidates-review.csv"), toCsv(hospitalCandidates.map(amapToExport)), "utf8");
  await writeFile(join(directory, "quality-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { records, report };
}

function cultureToExport(record: EnrichedCultureFacilityRecord): ExportRecord {
  const [longitude = "", latitude = ""] = record.amap?.location.split(",") ?? [];
  return {
    address: record.address, category: record.category, classification_status: "official_list",
    coordinate_system: record.amap ? "GCJ-02" : "", district: record.district, latitude, longitude,
    match_confidence: record.amap?.confidence ?? "unmatched", name: record.name, source_id: record.sourceId, source_url: record.sourceUrl,
    verification_note: record.amap ? `Amap POI ${record.amap.poiId}; score ${record.amap.score}` : "No Amap POI match returned",
  };
}

function amapToExport(record: AmapCollectedFacilityRecord): ExportRecord {
  const [longitude = "", latitude = ""] = record.amap.location.split(",");
  return {
    address: record.address, category: record.category, classification_status: record.classificationStatus,
    coordinate_system: "GCJ-02", district: record.district, latitude, longitude, match_confidence: "", name: record.name,
    source_id: record.sourceId, source_url: record.sourceUrl,
    verification_note: `Amap POI ${record.amap.poiId}; query: ${record.searchEvidence.join(" | ")}`,
  };
}

function officialHospitalToExport(record: EnrichedOfficialHospital): ExportRecord {
  const [longitude = "", latitude = ""] = record.amap?.location.split(",") ?? [];
  return {
    address: record.amap?.address ?? "", category: record.category, classification_status: "official_assessment_snapshot",
    coordinate_system: record.amap ? "GCJ-02" : "", district: "", latitude, longitude,
    match_confidence: record.amap?.confidence ?? "unmatched", name: record.name, source_id: record.sourceId, source_url: record.sourceUrl,
    verification_note: `Shanghai health authority assessment announcement dated ${record.announcementDate}; ${record.amap ? `Amap POI ${record.amap.poiId}; score ${record.amap.score}` : "no Amap match"}`,
  };
}

async function readJson<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, "utf8")) as T; }

function countBy<T>(values: T[], value: (item: T) => string): Record<string, number> {
  return Object.fromEntries(Object.entries(Object.groupBy(values, value)).map(([key, group]) => [key, group?.length ?? 0]));
}

function toCsv(records: ExportRecord[]): string {
  const headers = Object.keys(records[0] ?? {}) as Array<keyof ExportRecord>;
  const rows = records.map((record) => headers.map((header) => escapeCsv(record[header])).join(","));
  return `${headers.join(",")}\n${rows.join("\n")}\n`;
}

function escapeCsv(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
