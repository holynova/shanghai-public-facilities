import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AmapCollectedFacilityRecord } from "../domain/facility.js";

type ExportRecord = {
  address: string;
  category: string;
  classification_status: string;
  coordinate_system: "GCJ-02";
  district: string;
  latitude: string;
  longitude: string;
  match_confidence: string;
  name: string;
  source_id: string;
  source_url: string;
  verification_note: string;
};

export async function exportCityCatalogue(options: { citySlug: string; snapshot: string }): Promise<{ records: ExportRecord[]; report: object }> {
  const directory = join("data", "interim", options.snapshot);
  const [catalogue, metro] = await Promise.all([
    readJson<AmapCollectedFacilityRecord[]>(join(directory, "amap-city-catalogue.json")),
    readJson<AmapCollectedFacilityRecord[]>(join(directory, "amap-metro-lines.json")),
  ]);
  const records = [...catalogue.filter(shouldExportCatalogueRecord), ...metro].map(toExport).sort((left, right) => left.category.localeCompare(right.category, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"));
  const byCategory = Object.fromEntries(Object.entries(Object.groupBy(records, (record) => record.category)).map(([category, group]) => [category, group?.length ?? 0]));
  const report = { generatedAt: new Date().toISOString(), city: options.citySlug, totalRecords: records.length, byCategory, caveats: ["Coordinates are GCJ-02 as returned by Amap.", "Hospital grades are Amap keyword candidates and need official-source verification before being treated as authoritative.", "Catalogue categories are Amap-derived and may include omissions or stale POIs."] };
  const output = join("outputs", options.snapshot);
  await mkdir(output, { recursive: true });
  await writeFile(join(output, `${options.citySlug}-public-facilities.csv`), toCsv(records), "utf8");
  await writeFile(join(output, `${options.citySlug}-quality-report.json`), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { records, report };
}

function toExport(record: AmapCollectedFacilityRecord): ExportRecord {
  const [longitude = "", latitude = ""] = record.amap.location.split(",");
  return { address: record.address, category: record.category, classification_status: record.classificationStatus, coordinate_system: "GCJ-02", district: record.district, latitude, longitude, match_confidence: "", name: record.name, source_id: record.sourceId, source_url: record.sourceUrl, verification_note: `Amap POI ${record.amap.poiId}; query: ${record.searchEvidence.join(" | ")}` };
}

function shouldExportCatalogueRecord(record: AmapCollectedFacilityRecord): boolean {
  if (record.category === "landmark.city_landmark" && record.searchEvidence.includes("国贸CBD")) return false;
  if (record.category === "transport.airport") return ["北京首都国际机场", "北京大兴国际机场"].includes(record.name);
  if (record.category === "landmark.city_landmark") {
    return ["天安门", "故宫博物院", "天坛公园", "颐和园", "国家体育场", "国家游泳中心", "北京环球度假区", "什刹海", "北京坊", "中国国际贸易中心", "国贸商城"].includes(record.name);
  }
  return true;
}
async function readJson<T>(file: string): Promise<T> { return JSON.parse(await readFile(file, "utf8")) as T; }
function toCsv(records: ExportRecord[]): string {
  const headers = Object.keys(records[0] ?? {}) as Array<keyof ExportRecord>;
  return `${headers.join(",")}\n${records.map((record) => headers.map((header) => `"${record[header].replaceAll('"', '""')}"`).join(",")).join("\n")}\n`;
}
