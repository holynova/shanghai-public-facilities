import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type ImportedMedicalInstitution = {
  address: string;
  categoryCandidate: "hospital.secondary_a" | "hospital.tertiary_a" | null;
  district: string;
  name: string;
  rawSettlementLevel: string;
  sourceFile: string;
  sourceId: string;
};

/** Imports a public-data CSV without equating generic settlement levels to accreditation grades. */
export async function normalizeMedicalInstitutionImport(snapshot: string, input = join("data", "manual", "medical-institutions.csv")): Promise<ImportedMedicalInstitution[]> {
  const text = await readFile(input, "utf8");
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error(`No data rows found in ${input}.`);
  const headers = rows[0].map(normalizeHeader);
  const nameIndex = findHeader(headers, ["医院名称", "医疗机构名称", "机构名称", "名称"]);
  const levelIndex = findHeader(headers, ["结算等级", "医院等级", "机构等级", "等级"]);
  const addressIndex = findHeader(headers, ["地址", "机构地址", "医疗机构地址"]);
  const districtIndex = findHeader(headers, ["所属区", "所在区", "区县", "行政区"]);
  if (nameIndex < 0 || levelIndex < 0) throw new Error("CSV must include an institution-name column and a settlement/grade column.");
  const sourceFile = input.split("/").at(-1) ?? input;
  const records = rows.slice(1).map((row, index) => {
    const name = valueAt(row, nameIndex);
    const rawSettlementLevel = valueAt(row, levelIndex);
    return {
      address: addressIndex >= 0 ? valueAt(row, addressIndex) : "",
      categoryCandidate: categoryCandidate(rawSettlementLevel),
      district: districtIndex >= 0 ? valueAt(row, districtIndex) : "",
      name, rawSettlementLevel, sourceFile, sourceId: `import:${sourceFile}:${index + 2}`,
    };
  }).filter((record) => record.name);
  const directory = join("data", "interim", snapshot);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "medical-institutions-import.json"), `${JSON.stringify(records, null, 2)}\n`, "utf8");
  return records;
}

function categoryCandidate(value: string): ImportedMedicalInstitution["categoryCandidate"] {
  const normalized = value.replace(/\s/g, "");
  if (/三级甲等|三甲/.test(normalized)) return "hospital.tertiary_a";
  if (/二级甲等|二甲/.test(normalized)) return "hospital.secondary_a";
  return null;
}
function findHeader(headers: string[], choices: string[]): number { return headers.findIndex((header) => choices.includes(header)); }
function normalizeHeader(value: string): string { return value.replace(/^\uFEFF/, "").trim().replace(/\s/g, ""); }
function valueAt(row: string[], index: number): string { return (row[index] ?? "").trim(); }
function parseCsv(input: string): string[][] {
  const rows: string[][] = []; let field = ""; let row: string[] = []; let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]; const next = input[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(field); field = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field); if (row.some((value) => value.trim())) rows.push(row); row = []; field = ""; continue;
    }
    field += char;
  }
  row.push(field); if (row.some((value) => value.trim())) rows.push(row); return rows;
}
