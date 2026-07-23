import { getEnvironmentStatus } from "./config/env.js";
import { AmapApiError, AmapClient } from "./amap/client.js";
import { enrichCultureFacilities } from "./amap/enrich-culture.js";
import { collectAmapFacilities, validAmapCollectionProfiles } from "./amap/collect-facilities.js";
import { enrichOfficialHospitals } from "./amap/enrich-official-hospitals.js";
import { collectMetroFromLines } from "./amap/collect-metro-lines.js";
import { collectCityCatalogue } from "./amap/collect-city-catalogue.js";
import { fetchCultureSources } from "./sources/culture.js";
import { normalizeCultureSources } from "./sources/normalize-culture.js";
import { normalizeMedicalInstitutionImport } from "./sources/normalize-medical-institution-import.js";
import { exportAllFacilities } from "./export/export-all.js";
import { exportCityCatalogue } from "./export/export-city-catalogue.js";

const command = process.argv[2] ?? "help";

function printHelp(): void {
  console.log(`Shanghai Public Facilities Collector\n\nCommands:\n  check-env                                                   Show local configuration status\n  amap search <keywords> [--city]                             Search city POIs through Amap\n  amap geocode <address> [--city]                             Convert an address to GCJ-02 coordinates\n  amap enrich-culture --snapshot YYYY-MM-DD [--limit N]       Match culture records to Amap POIs\n  amap collect <metro|hospital|primary-care> --snapshot DATE  Collect Amap POIs with checkpoints\n  amap collect-metro-lines --snapshot DATE --city             Collect city rail lines and stations\n  amap collect-city-catalogue --snapshot DATE --city 北京市     Collect Beijing categories through Amap\n  sources fetch-culture --snapshot YYYY-MM-DD                 Download official culture source snapshots\n  sources normalize-culture --snapshot YYYY-MM-DD             Normalize culture snapshots to facility records\n  sources import-medical-institutions --snapshot DATE         Normalize manual medical-institution CSV\n  export all --culture-snapshot DATE --amap-snapshot DATE     Create CSV and quality report\n  help                                                        Show this help\n\nBefore live collection:\n  cp .env.example .env\n  # Set AMAP_WEB_KEY in .env\n  npm run check:env`);
}

function checkEnvironment(): number {
  const status = getEnvironmentStatus();

  console.log(`Node: ${status.nodeVersion}`);
  console.log(`AMAP_WEB_KEY: ${status.amapWebKeyConfigured ? "configured" : "missing"}`);
  console.log(`AMAP_MCP_KEY: ${status.amapMcpKeyConfigured ? "configured (optional)" : "not configured (optional)"}`);

  if (!status.amapWebKeyConfigured) {
    console.error("\nBlocked: set AMAP_WEB_KEY in a local .env file before live API collection.");
    return 3;
  }

  console.log("\nReady: live Amap Web Service API collection can be enabled.");
  return 0;
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function runAmapCommand(): Promise<number> {
  const action = process.argv[3];
  const value = process.argv[4];
  const city = optionValue("--city") ?? "上海市";

  if (action === "enrich-culture") {
    const snapshot = optionValue("--snapshot");
    const limit = Number.parseInt(optionValue("--limit") ?? "", 10);
    if (!snapshot) {
      console.error("Usage: amap enrich-culture --snapshot YYYY-MM-DD [--limit N] [--resume]");
      return 1;
    }
    try {
      const records = await enrichCultureFacilities(snapshot, {
        limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
        resume: process.argv.includes("--resume"),
        retryUnmatched: process.argv.includes("--retry-unmatched"),
      });
      const byConfidence = Object.groupBy(records, (record) => record.amap?.confidence ?? "unmatched");
      console.log(JSON.stringify({
        count: records.length,
        byConfidence: Object.fromEntries(Object.entries(byConfidence).map(([key, group]) => [key, group?.length ?? 0])),
      }, null, 2));
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Amap culture enrichment failed.");
      return 4;
    }
  }

  if (action === "enrich-official-hospitals") {
    const snapshot = optionValue("--snapshot");
    const limit = Number.parseInt(optionValue("--limit") ?? "", 10);
    if (!snapshot) {
      console.error("Usage: amap enrich-official-hospitals --snapshot YYYY-MM-DD [--limit N] [--resume]");
      return 1;
    }
    try {
      const records = await enrichOfficialHospitals(snapshot, { limit: Number.isFinite(limit) && limit > 0 ? limit : undefined, resume: process.argv.includes("--resume") });
      const byConfidence = Object.fromEntries(Object.entries(Object.groupBy(records, (record) => record.amap?.confidence ?? "unmatched"))
        .map(([confidence, group]) => [confidence, group?.length ?? 0]));
      console.log(JSON.stringify({ count: records.length, byConfidence }, null, 2));
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Official hospital enrichment failed.");
      return 4;
    }
  }

  if (action === "collect") {
    const profile = value;
    const snapshot = optionValue("--snapshot");
    if (!profile || !snapshot) {
      console.error(`Usage: amap collect <${validAmapCollectionProfiles().join("|")}> --snapshot YYYY-MM-DD`);
      return 1;
    }
    try {
      const records = await collectAmapFacilities(snapshot, profile);
      const byCategory = Object.fromEntries(Object.entries(Object.groupBy(records, (record) => record.category))
        .map(([category, group]) => [category, group?.length ?? 0]));
      console.log(JSON.stringify({ count: records.length, byCategory }, null, 2));
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Amap POI collection failed.");
      return 4;
    }
  }

  if (action === "collect-metro-lines") {
    const snapshot = optionValue("--snapshot");
    if (!snapshot) { console.error("Usage: amap collect-metro-lines --snapshot YYYY-MM-DD"); return 1; }
    try {
      const records = await collectMetroFromLines(snapshot, city);
      console.log(JSON.stringify({ count: records.length }, null, 2));
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Amap metro line collection failed.");
      return 4;
    }
  }

  if (action === "collect-city-catalogue") {
    const snapshot = optionValue("--snapshot");
    if (!snapshot) { console.error("Usage: amap collect-city-catalogue --snapshot YYYY-MM-DD --city 北京市"); return 1; }
    try {
      const records = await collectCityCatalogue(snapshot, city);
      const byCategory = Object.fromEntries(Object.entries(Object.groupBy(records, (record) => record.category))
        .map(([category, group]) => [category, group?.length ?? 0]));
      console.log(JSON.stringify({ count: records.length, byCategory }, null, 2));
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Amap city catalogue collection failed.");
      return 4;
    }
  }

  const client = new AmapClient();

  if (!action || !value) {
    console.error("Usage: amap search <keywords> [--city 上海市] | amap geocode <address> [--city 上海市]");
    return 1;
  }

  try {
    if (action === "search") {
      const result = await client.searchText({ keywords: value, city });
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    if (action === "geocode") {
      const result = await client.geocode(value, city);
      console.log(JSON.stringify(result, null, 2));
      return 0;
    }

    console.error(`Unknown Amap action: ${action}`);
    return 1;
  } catch (error) {
    if (error instanceof AmapApiError || error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Unknown Amap client error.");
    }
    return 4;
  }
}

async function runSourcesCommand(): Promise<number> {
  const action = process.argv[3];
  const snapshot = optionValue("--snapshot");

  if (!snapshot || !["fetch-culture", "normalize-culture", "import-medical-institutions"].includes(action ?? "")) {
    console.error("Usage: sources fetch-culture|normalize-culture|import-medical-institutions --snapshot YYYY-MM-DD");
    return 1;
  }

  try {
    if (action === "fetch-culture") {
      const entries = await fetchCultureSources(snapshot);
      console.log(JSON.stringify(entries, null, 2));
    } else if (action === "normalize-culture") {
      const records = await normalizeCultureSources(snapshot);
      const byCategory = Object.fromEntries(
        Object.entries(Object.groupBy(records, (record) => record.category)).map(([category, group]) => [
          category,
          group?.length ?? 0,
        ]),
      );
      console.log(JSON.stringify({ count: records.length, byCategory }, null, 2));
    } else {
      const records = await normalizeMedicalInstitutionImport(snapshot);
      const categoryCandidates = Object.fromEntries(Object.entries(Object.groupBy(records, (record) => record.categoryCandidate ?? "not_explicit"))
        .map(([category, group]) => [category, group?.length ?? 0]));
      console.log(JSON.stringify({ count: records.length, categoryCandidates }, null, 2));
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Official source download failed.");
    return 4;
  }
}

async function runExportCommand(): Promise<number> {
  if (process.argv[3] === "city") {
    const citySlug = optionValue("--city-slug");
    const snapshot = optionValue("--snapshot");
    if (!citySlug || !snapshot) { console.error("Usage: export city --city-slug beijing --snapshot YYYY-MM-DD"); return 1; }
    try {
      const result = await exportCityCatalogue({ citySlug, snapshot });
      console.log(JSON.stringify({ count: result.records.length, report: result.report }, null, 2));
      return 0;
    } catch (error) {
      console.error(error instanceof Error ? error.message : "City catalogue export failed.");
      return 4;
    }
  }
  if (process.argv[3] !== "all") {
    console.error("Usage: export all --culture-snapshot DATE --amap-snapshot DATE [--output-snapshot DATE]");
    return 1;
  }
  const cultureSnapshot = optionValue("--culture-snapshot");
  const amapSnapshot = optionValue("--amap-snapshot");
  const outputSnapshot = optionValue("--output-snapshot") ?? amapSnapshot;
  if (!cultureSnapshot || !amapSnapshot || !outputSnapshot) {
    console.error("Usage: export all --culture-snapshot DATE --amap-snapshot DATE [--output-snapshot DATE]");
    return 1;
  }
  try {
    const result = await exportAllFacilities({ cultureSnapshot, amapSnapshot, outputSnapshot });
    console.log(JSON.stringify({ count: result.records.length, report: result.report }, null, 2));
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Export failed.");
    return 4;
  }
}

switch (command) {
  case "check-env":
    process.exitCode = checkEnvironment();
    break;
  case "amap":
    process.exitCode = await runAmapCommand();
    break;
  case "sources":
    process.exitCode = await runSourcesCommand();
    break;
  case "export":
    process.exitCode = await runExportCommand();
    break;
  case "help":
  case "--help":
  case "-h":
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exitCode = 1;
}
