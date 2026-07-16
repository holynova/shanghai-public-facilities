import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AmapClient } from "./client.js";
import type { AmapPoi } from "../domain/amap.js";

type OfficialHospital = {
  announcementDate: string;
  category: "hospital.tertiary_a" | "hospital.secondary_a";
  name: string;
  sourceUrl: string;
};

export type EnrichedOfficialHospital = OfficialHospital & {
  amap: { address: string; confidence: "high" | "medium" | "low" | "unmatched"; location: string; poiId: string; score: number; typeCode: string } | null;
  sourceId: string;
};

export async function enrichOfficialHospitals(snapshot: string, options: { limit?: number; resume?: boolean } = {}): Promise<EnrichedOfficialHospital[]> {
  const hospitals = JSON.parse(await readFile(join("data", "manual", "official-hospital-assessments.json"), "utf8")) as OfficialHospital[];
  const directory = join("data", "interim", snapshot);
  const output = join(directory, "official-hospitals-enriched.json");
  const completed = new Map((options.resume ? await load(output) : []).map((record) => [record.sourceId, record]));
  const target = options.limit ? hospitals.slice(0, options.limit) : hospitals;
  const client = new AmapClient();
  for (let index = 0; index < target.length; index += 1) {
    const hospital = target[index];
    const sourceId = key(hospital);
    if (completed.has(sourceId)) continue;
    const result = await client.searchText({ city: "上海市", cityLimit: true, keywords: hospital.name, pageSize: 25 });
    completed.set(sourceId, { ...hospital, sourceId, amap: select(hospital.name, result.pois) });
    if ((index + 1) % 10 === 0 || index + 1 === target.length) {
      await persist(directory, output, hospitals, completed);
      console.error(`Official hospital enrichment: ${index + 1}/${target.length}`);
    }
  }
  await persist(directory, output, hospitals, completed);
  return hospitals.filter((hospital) => completed.has(key(hospital))).map((hospital) => completed.get(key(hospital))!);
}

function select(name: string, pois: AmapPoi[]): EnrichedOfficialHospital["amap"] {
  const ranked = pois.filter((poi) => poi.location && poi.typecode.split("|").some((code) => code.startsWith("09")))
    .map((poi) => ({ poi, score: similarity(normalize(name), normalize(poi.name)) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best) return null;
  const confidence = best.score >= 0.9 ? "high" : best.score >= 0.72 ? "medium" : "low";
  return { address: best.poi.address, confidence, location: best.poi.location, poiId: best.poi.id, score: best.score, typeCode: best.poi.typecode };
}

function normalize(value: string): string {
  return value.replace(/上海市|上海|交通大学医学院|复旦大学附属|大学附属|医学院附属/g, "").replace(/[\s（）()、，,。·\-]/g, "").toLowerCase();
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.9;
  const common = [...new Set(left)].filter((character) => right.includes(character)).length;
  return common / Math.max(new Set(left).size, new Set(right).size);
}

function key(record: OfficialHospital): string { return `official-hospital:${record.name}`; }
async function load(file: string): Promise<EnrichedOfficialHospital[]> {
  try { return JSON.parse(await readFile(file, "utf8")) as EnrichedOfficialHospital[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
async function persist(directory: string, file: string, hospitals: OfficialHospital[], completed: Map<string, EnrichedOfficialHospital>): Promise<void> {
  await mkdir(directory, { recursive: true });
  const ordered = hospitals.filter((hospital) => completed.has(key(hospital))).map((hospital) => completed.get(key(hospital))!);
  await writeFile(file, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}
