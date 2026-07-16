import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export const CULTURE_SOURCES = [
  {
    id: "libraries-2026",
    category: "library",
    title: "2026年上海市公共图书馆名录",
    url: "https://whlyj.sh.gov.cn/tsg/20251009/d365d0082cc94164b15fa9202675b785.html",
  },
  {
    id: "museums-2025",
    category: "culture.museum",
    title: "上海市博物馆名单（2025年度）",
    url: "https://whlyj.sh.gov.cn/bwg/20260106/265b828de4394054bdc2e61e1599ed4c.html",
  },
  {
    id: "art-galleries-2025",
    category: "culture.art_gallery",
    title: "2025年上海市美术馆名录",
    url: "https://whlyj.sh.gov.cn/msg/20250928/db0cbc0a1edf478f99c4900522a56e3b.html",
  },
] as const;

export type CultureSnapshotManifestEntry = {
  bytes: number;
  category: string;
  contentHash: string;
  fetchedAt: string;
  id: string;
  rawFile: string;
  title: string;
  url: string;
};

export async function fetchCultureSources(snapshot: string): Promise<CultureSnapshotManifestEntry[]> {
  const outputDirectory = join("data", "raw", snapshot, "culture");
  await mkdir(outputDirectory, { recursive: true });

  const entries: CultureSnapshotManifestEntry[] = [];
  for (const source of CULTURE_SOURCES) {
    const rawFile = join(outputDirectory, `${source.id}.html`);
    await downloadOfficialHtml(source.url, rawFile);
    const content = await readFile(rawFile, "utf8");
    entries.push({
      bytes: Buffer.byteLength(content),
      category: source.category,
      contentHash: createHash("sha256").update(content).digest("hex"),
      fetchedAt: new Date().toISOString(),
      id: source.id,
      rawFile,
      title: source.title,
      url: source.url,
    });
  }

  await writeFile(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(entries, null, 2)}\n`,
    "utf8",
  );

  return entries;
}

async function downloadOfficialHtml(url: string, outputFile: string): Promise<void> {
  try {
    await execFileAsync("curl", [
      "--connect-timeout", "10",
      "--fail",
      "--location",
      "--max-time", "60",
      "--retry", "3",
      "--retry-all-errors",
      "--silent",
      "--show-error",
      "--output", outputFile,
      url,
    ]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown curl failure";
    throw new Error(`Official culture source download failed for ${url}: ${detail}`);
  }
}
