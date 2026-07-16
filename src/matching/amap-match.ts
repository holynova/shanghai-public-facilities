import type { AmapPoi } from "../domain/amap.js";
import type { CultureFacilityRecord } from "../domain/facility.js";

export type AmapMatch = {
  candidate: AmapPoi | null;
  confidence: "high" | "medium" | "low" | "unmatched";
  score: number;
};

export function selectBestAmapMatch(
  facility: CultureFacilityRecord,
  candidates: AmapPoi[],
): AmapMatch {
  const ranked = candidates
    .filter((candidate) => candidate.location)
    .map((candidate) => ({ candidate, score: scoreCandidate(facility, candidate) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];

  if (!best) return { candidate: null, confidence: "unmatched", score: 0 };
  if (best.score >= 0.85) return { candidate: best.candidate, confidence: "high", score: best.score };
  if (best.score >= 0.65) return { candidate: best.candidate, confidence: "medium", score: best.score };
  return { candidate: best.candidate, confidence: "low", score: best.score };
}

function scoreCandidate(facility: CultureFacilityRecord, candidate: AmapPoi): number {
  const name = similarity(normalize(facility.name), normalize(candidate.name));
  const address = similarity(normalize(facility.address), normalize(candidate.address));
  const district = normalize(candidate.adname) === normalize(facility.district) ? 1 : 0;
  const type = typeScore(facility.category, candidate.typecode);

  return round(0.5 * name + 0.3 * address + 0.1 * district + 0.1 * type);
}

function typeScore(category: string, typeCode: string): number {
  if (category === "culture.museum") return typeCode.startsWith("1401") ? 1 : 0;
  if (category === "culture.art_gallery") return typeCode.startsWith("1402") ? 1 : 0;
  if (category.startsWith("library")) return typeCode.startsWith("1405") ? 1 : 0;
  return 0;
}

function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.8;

  const common = [...new Set(left)].filter((character) => right.includes(character)).length;
  return common / Math.max(new Set(left).size, new Set(right).size);
}

function normalize(value: string): string {
  return value
    .replace(/上海市|上海/g, "")
    .replace(/[\s（）()、，,。·\-]/g, "")
    .toLowerCase();
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
