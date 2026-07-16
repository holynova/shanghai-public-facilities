import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { load } from "cheerio";
import type { CultureFacilityRecord } from "../domain/facility.js";
import { CULTURE_SOURCES } from "./culture.js";

type TableShape = "library" | "museum" | "artGallery";

export async function normalizeCultureSources(snapshot: string): Promise<CultureFacilityRecord[]> {
  const records: CultureFacilityRecord[] = [];

  for (const source of CULTURE_SOURCES) {
    const rawFile = join("data", "raw", snapshot, "culture", `${source.id}.html`);
    const html = await readFile(rawFile, "utf8");
    const shape: TableShape = source.id.startsWith("libraries")
      ? "library"
      : source.id.startsWith("museums")
        ? "museum"
        : "artGallery";
    records.push(...parseCultureTable(html, shape, source.id, source.url));
  }

  const outputDirectory = join("data", "interim", snapshot);
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    join(outputDirectory, "culture-facilities.json"),
    `${JSON.stringify(records, null, 2)}\n`,
    "utf8",
  );

  return records;
}

export function parseCultureTable(
  html: string,
  shape: TableShape,
  sourceId: string,
  sourceUrl: string,
): CultureFacilityRecord[] {
  const $ = load(html);
  const rows = $("table").first().find("tr").toArray().slice(1);
  let district = "";
  const records: CultureFacilityRecord[] = [];

  for (const row of rows) {
    const cells = $(row)
      .find("th,td")
      .map((_, cell) => normalizeText($(cell).text()))
      .get();
    const parsed = parseRow(cells, shape, district);
    if (!parsed) {
      continue;
    }
    district = parsed.district || district;
    if (!parsed.name || !parsed.address || !district) {
      continue;
    }
    records.push({
      address: parsed.address,
      category: categoryFor(shape, parsed.name, district),
      district,
      name: parsed.name,
      sourceId,
      sourceUrl,
    });
  }

  return records;
}

function parseRow(cells: string[], shape: TableShape, inheritedDistrict: string): {
  address: string;
  district: string;
  name: string;
} | null {
  const hasSequence = /^\d+$/.test(cells[0] ?? "");
  const fullWidth = shape === "library" ? 7 : shape === "museum" ? 4 : 6;

  if (cells.length >= fullWidth && hasSequence) {
    return { address: cells[3] ?? "", district: cells[1] ?? "", name: cells[2] ?? "" };
  }

  if (cells.length >= fullWidth - 1 && hasSequence) {
    return { address: cells[2] ?? "", district: inheritedDistrict, name: cells[1] ?? "" };
  }

  if (looksLikeDistrict(cells[0]) && cells.length >= fullWidth - 1) {
    return { address: cells[2] ?? "", district: cells[0] ?? "", name: cells[1] ?? "" };
  }

  return { address: cells[1] ?? "", district: inheritedDistrict, name: cells[0] ?? "" };
}

function looksLikeDistrict(value: string | undefined): boolean {
  return Boolean(value && (value === "上海市" || value.endsWith("区") || value.endsWith("新区")));
}

function categoryFor(shape: TableShape, name: string, district: string): string {
  if (shape === "museum") return "culture.museum";
  if (shape === "artGallery") return "culture.art_gallery";
  if (name.includes("分馆")) return "library.branch";
  if (district === "上海市") return "library.municipal";
  if (/(街道|镇)/.test(name)) return "library.subdistrict_town";
  return "library.district";
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
