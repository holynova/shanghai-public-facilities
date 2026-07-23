import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AmapClient } from "./client.js";
import type { AmapBusLine, AmapBusStop } from "../domain/amap.js";
import type { AmapCollectedFacilityRecord } from "../domain/facility.js";

const CITY_RAIL_CONFIG = {
  "上海市": {
    cityCode: "021",
    lineQueries: [...Array.from({ length: 18 }, (_, index) => `地铁${index + 1}号线`), "浦江线", "磁浮线", "磁悬浮", "机场联络线", "市域机场线"],
    outputFile: "amap-metro-lines.json",
  },
  "北京市": {
    cityCode: "010",
    lineQueries: [...Array.from({ length: 19 }, (_, index) => `地铁${index + 1}号线`), "地铁22号线", "地铁24号线", "地铁25号线", "地铁27号线", "S1线", "首都机场线", "大兴机场线", "亦庄线", "昌平线", "房山线", "燕房线", "西郊线"],
    outputFile: "amap-metro-lines.json",
  },
} as const;

export async function collectMetroFromLines(snapshot: string, city = "上海市"): Promise<AmapCollectedFacilityRecord[]> {
  const config = CITY_RAIL_CONFIG[city as keyof typeof CITY_RAIL_CONFIG];
  if (!config) throw new Error(`Unsupported metro collection city: ${city}`);
  const client = new AmapClient();
  const lines = new Map<string, AmapBusLine>();
  for (const query of config.lineQueries) {
    console.error(`Amap metro line search: ${query}`);
    for (const line of await client.searchBusLines(query)) {
      if (!isCityRailLine(line, config.cityCode)) continue;
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
  await writeFile(join(directory, config.outputFile), `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return records;
}

function isCityRailLine(line: AmapBusLine, cityCode: string): boolean {
  return line.citycode === cityCode && (line.type === "地铁" || /磁浮|磁悬浮|市域|机场线|S1/.test(line.name));
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
