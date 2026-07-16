import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadFacilityIndex } from "../dist/web/facility-index.js";

const source = resolve("outputs/2026-07-16/shanghai-public-facilities.csv");
const destination = resolve("docs/data/facilities.json");
const facilities = loadFacilityIndex(source);

await mkdir(resolve("docs/data"), { recursive: true });
await writeFile(destination, `${JSON.stringify({ coordinateSystem: "GCJ-02", facilities })}\n`, "utf8");
console.log(`Wrote ${facilities.length} facilities to ${destination}`);
