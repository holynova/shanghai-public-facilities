import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AmapClient } from "./client.js";
import type { AmapBusLine, AmapBusStop } from "../domain/amap.js";
import type { AmapCollectedFacilityRecord } from "../domain/facility.js";

const LINE_QUERIES = [
  ...Array.from({ length: 18 }, (_, index) => `地铁${index + 1}号线`),
  "浦江线", "磁浮线", "磁悬浮", "机场联络线", "市域机场线",
];

export async function collectMetroFromLines(snapshot: string): Promise<AmapCollectedFacilityRecord[]> {
  const client = new AmapClient();
  const lines = new Map<string, AmapBusLine>();
  for (const query of LINE_QUERIES) {
    console.error(`Amap metro line search: ${query}`);
    for (const line of await client.searchBusLines(query)) {
      if (!isShanghaiRailLine(line)) continue;
      const canonical = line.name.replace(/\(.*/, "");
      if (!lines.has(canonical)) lines.set(canonical, line);
    }
  }
  const stations = new Map<string, AmapCollectedFacilityRecord>();
  for (const [lineName, brief] of lines) {
    const line = await client.getBusLine(brief.id);
    if (!line) continue;
    console.error(`Amap metro line detail: ${lineName} (${line.busstops.length} stops)`);
    for (const stop of line.busstops) mergeStation(stations, stop, lineName);
  }
  const records = [...stations.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  const directory = join("data", "interim", snapshot);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "amap-metro-lines.json"), `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return records;
}

function isShanghaiRailLine(line: AmapBusLine): boolean {
  return line.citycode === "021" && (line.type === "地铁" || /磁浮|磁悬浮|市域/.test(line.name));
}

function mergeStation(records: Map<string, AmapCollectedFacilityRecord>, stop: AmapBusStop, lineName: string): void {
  if (!stop.name || !stop.location) return;
  const key = normalize(stop.name);
  const present = records.get(key);
  if (present) {
    present.searchEvidence = [...new Set([...present.searchEvidence, lineName])].sort();
    return;
  }
  records.set(key, {
    address: "", amap: { location: stop.location, poiId: stop.id, type: "交通设施服务;地铁站;地铁站", typeCode: "150500" },
    category: "transit.metro_station", classificationStatus: "inferred", district: "", name: stop.name,
    searchEvidence: [lineName], sourceId: `amap-subway:${stop.id}`, sourceUrl: "https://lbs.amap.com/api/subway-api/",
  });
}

function normalize(value: string): string { return value.replace(/[\s（）()]/g, "").toLowerCase(); }
