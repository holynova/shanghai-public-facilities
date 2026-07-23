#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("Usage: node scripts/import-beijing-metro.mjs <source.json> <output.json>");

const source = JSON.parse(await readFile(input, "utf8"));
const city = source?.data?.info?.find((entry) => entry.city_name === "北京");
if (!city?.subway_line) throw new Error("Beijing subway lines were not found in the source data.");

const stations = new Map();
for (const line of city.subway_line) {
  const lineName = String(line.subway_line_name || "").trim();
  for (const station of line.station || []) {
    const name = String(station.subway_station_name || "").trim();
    if (!name || !Number.isFinite(Number(station.longitude)) || !Number.isFinite(Number(station.latitude))) continue;
    const key = name.replace(/[\s（）()]/g, "").toLowerCase();
    const [longitude, latitude] = bd09ToGcj02(Number(station.longitude), Number(station.latitude));
    const present = stations.get(key);
    if (present) {
      present.searchEvidence = [...new Set([...present.searchEvidence, lineName])].sort();
      continue;
    }
    stations.set(key, {
      address: "",
      amap: { location: `${longitude.toFixed(6)},${latitude.toFixed(6)}`, poiId: `beijing-metro:${station.subway_station_id}`, type: "交通设施服务;地铁站;地铁站", typeCode: "150500" },
      category: "transit.metro_station", classificationStatus: "inferred", district: "", name,
      searchEvidence: [lineName], sourceId: `beijing-metro:${station.subway_station_id}`,
      sourceUrl: "https://gist.github.com/akinLiu/426f6d1f2dd84417631f",
    });
  }
}

const records = [...stations.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(records, null, 2)}\n`, "utf8");
console.log(`Imported ${records.length} Beijing metro stations.`);

function bd09ToGcj02(longitude, latitude) {
  const x = longitude - 0.0065;
  const y = latitude - 0.006;
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * Math.PI);
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * Math.PI);
  return [z * Math.cos(theta), z * Math.sin(theta)];
}
