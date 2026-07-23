import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadFacilityIndex } from "../dist/web/facility-index.js";

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (!value.startsWith("--")) return pairs;
  pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));
const city = options.city ?? "shanghai";
const source = resolve(options.source ?? "outputs/2026-07-16/shanghai-public-facilities.csv");
const destination = resolve(options.destination ?? `docs/data/${city}.json`);
const facilities = loadFacilityIndex(source);

await mkdir(resolve("docs/data"), { recursive: true });
await writeFile(destination, `${JSON.stringify({ city, coordinateSystem: "GCJ-02", facilities })}\n`, "utf8");
console.log(`Wrote ${facilities.length} ${city} facilities to ${destination}`);
