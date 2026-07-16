import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AmapClient } from "./client.js";
import type { AmapPoi } from "../domain/amap.js";
import type { CultureFacilityRecord } from "../domain/facility.js";
import { selectBestAmapMatch, type AmapMatch } from "../matching/amap-match.js";

export type EnrichedCultureFacilityRecord = CultureFacilityRecord & {
  amap: {
    address: string;
    confidence: AmapMatch["confidence"] | "geocoded";
    location: string;
    poiId: string;
    score: number;
    typeCode: string;
  } | null;
};

export async function enrichCultureFacilities(
  snapshot: string,
  options: { limit?: number; resume?: boolean; retryUnmatched?: boolean } = {},
): Promise<EnrichedCultureFacilityRecord[]> {
  const inputFile = join("data", "interim", snapshot, "culture-facilities.json");
  const outputDirectory = join("data", "interim", snapshot);
  const outputFile = join(outputDirectory, "culture-enriched.json");
  const facilities = JSON.parse(await readFile(inputFile, "utf8")) as CultureFacilityRecord[];
  const existing = options.resume ? await loadExisting(outputFile) : [];
  const completed = new Map(existing
    .filter((record) => !(options.retryUnmatched && record.amap === null))
    .map((record) => [recordKey(record), record]));
  const target = options.limit ? facilities.slice(0, options.limit) : facilities;
  const client = new AmapClient();

  for (let index = 0; index < target.length; index += 1) {
    const facility = target[index];
    if (completed.has(recordKey(facility))) continue;

    const search = await client.searchText({
      city: "上海市",
      keywords: facility.name,
      pageSize: 25,
    });
    const match = selectBestAmapMatch(facility, search.pois);
    if (match.candidate) {
      completed.set(recordKey(facility), enrich(facility, match));
    } else {
      const geocode = (await client.geocode(facility.address, "上海市"))[0];
      completed.set(recordKey(facility), geocode ? enrichGeocoded(facility, geocode.formattedAddress, geocode.location) : enrich(facility, match));
    }

    if ((index + 1) % 10 === 0 || index + 1 === target.length) {
      await persist(outputDirectory, outputFile, facilities, completed);
      console.error(`Amap culture enrichment: ${index + 1}/${target.length}`);
    }
  }

  await persist(outputDirectory, outputFile, facilities, completed);
  return facilities
    .filter((facility) => completed.has(recordKey(facility)))
    .map((facility) => completed.get(recordKey(facility))!);
}

function enrich(facility: CultureFacilityRecord, match: AmapMatch): EnrichedCultureFacilityRecord {
  const candidate = match.candidate;
  return {
    ...facility,
    amap: candidate ? candidateToOutput(candidate, match) : null,
  };
}

function enrichGeocoded(facility: CultureFacilityRecord, address: string, location: string): EnrichedCultureFacilityRecord {
  return {
    ...facility,
    amap: { address, confidence: "geocoded", location, poiId: "", score: 1, typeCode: "" },
  };
}

function candidateToOutput(candidate: AmapPoi, match: AmapMatch): NonNullable<EnrichedCultureFacilityRecord["amap"]> {
  return {
    address: candidate.address,
    confidence: match.confidence,
    location: candidate.location,
    poiId: candidate.id,
    score: match.score,
    typeCode: candidate.typecode,
  };
}

async function loadExisting(outputFile: string): Promise<EnrichedCultureFacilityRecord[]> {
  try {
    return JSON.parse(await readFile(outputFile, "utf8")) as EnrichedCultureFacilityRecord[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function persist(
  outputDirectory: string,
  outputFile: string,
  facilities: CultureFacilityRecord[],
  completed: Map<string, EnrichedCultureFacilityRecord>,
): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const ordered = facilities
    .filter((facility) => completed.has(recordKey(facility)))
    .map((facility) => completed.get(recordKey(facility))!);
  await writeFile(outputFile, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
}

function recordKey(record: CultureFacilityRecord): string {
  return `${record.sourceId}|${record.name}|${record.address}`;
}
