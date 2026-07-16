import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AmapClient } from "./client.js";
import type { AmapPoi } from "../domain/amap.js";
import type { AmapCollectedFacilityRecord } from "../domain/facility.js";

type Query = {
  acceptedNames?: string[];
  allPages?: boolean;
  category: string;
  classificationStatus: AmapCollectedFacilityRecord["classificationStatus"];
  keywords: string;
  types?: string;
};

const PROFILES: Record<string, Query[]> = {
  metro: [{ category: "transit.metro_station", classificationStatus: "inferred", keywords: "地铁站", types: "150500" }],
  hospital: [
    { category: "hospital.tertiary_a", classificationStatus: "candidate", keywords: "三级甲等医院" },
    { category: "hospital.tertiary_a", classificationStatus: "candidate", keywords: "三甲医院" },
    { category: "hospital.secondary_a", classificationStatus: "candidate", keywords: "二级甲等医院" },
    { category: "hospital.secondary_a", classificationStatus: "candidate", keywords: "二甲医院" },
  ],
  "primary-care": [
    { category: "primary_care.community_center", classificationStatus: "inferred", keywords: "社区卫生服务中心", types: "090102" },
    { category: "primary_care.community_subcenter", classificationStatus: "candidate", keywords: "社区卫生服务分中心", types: "090000" },
    { category: "primary_care.community_station", classificationStatus: "candidate", keywords: "社区卫生服务站", types: "090000" },
  ],
  "city-amenities": [
    { allPages: true, category: "commerce.big_box_retail", classificationStatus: "candidate", keywords: "山姆会员商店" },
    { allPages: true, category: "commerce.big_box_retail", classificationStatus: "candidate", keywords: "麦德龙" },
    { allPages: true, category: "commerce.big_box_retail", classificationStatus: "candidate", keywords: "宜家家居" },
    { allPages: true, category: "commerce.big_box_retail", classificationStatus: "candidate", keywords: "开市客" },
    { category: "transport.railway_station", classificationStatus: "inferred", keywords: "上海火车站" },
    { category: "transport.railway_station", classificationStatus: "inferred", keywords: "上海虹桥站" },
    { category: "transport.railway_station", classificationStatus: "inferred", keywords: "上海南站" },
    { category: "transport.railway_station", classificationStatus: "inferred", keywords: "上海西站" },
    { category: "transport.railway_station", classificationStatus: "inferred", keywords: "上海东站" },
    { category: "transport.airport", classificationStatus: "inferred", keywords: "上海浦东国际机场" },
    { category: "transport.airport", classificationStatus: "inferred", keywords: "上海虹桥国际机场" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "人民广场" },
    { acceptedNames: ["东方明珠", "东方明珠广播电视塔"], category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "东方明珠" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "静安寺" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "外滩" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "豫园" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "上海中心大厦" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "金茂大厦" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "武康大楼" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "新天地" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "朱家角古镇" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "陆家嘴" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "南京路步行街" },
    { category: "landmark.city_landmark", classificationStatus: "candidate", keywords: "上海展览中心" },
    { acceptedNames: ["上海音乐厅", "凯迪拉克上海音乐厅"], category: "culture.concert_hall", classificationStatus: "candidate", keywords: "上海音乐厅" },
    { acceptedNames: ["上海交响音乐厅", "上海交响乐团音乐厅"], category: "culture.concert_hall", classificationStatus: "candidate", keywords: "上海交响音乐厅" },
    { category: "culture.concert_hall", classificationStatus: "candidate", keywords: "上海东方艺术中心" },
    { category: "culture.concert_hall", classificationStatus: "candidate", keywords: "上海大剧院" },
    { category: "culture.concert_hall", classificationStatus: "candidate", keywords: "上海保利大剧院" },
    { category: "culture.concert_hall", classificationStatus: "candidate", keywords: "上音歌剧院" },
    { category: "culture.concert_hall", classificationStatus: "candidate", keywords: "上海文化广场" },
    { category: "culture.concert_hall", classificationStatus: "candidate", keywords: "九棵树未来艺术中心" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "苏河湾万象天地" },
    { acceptedNames: ["静安大悦城", "上海静安大悦城"], category: "commerce.large_mall", classificationStatus: "candidate", keywords: "静安大悦城" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海恒隆广场" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海国金中心商场" },
    { acceptedNames: ["上海iapm商场", "上海iapm"], category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海iapm商场" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海K11购物艺术中心" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "兴业太古汇" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海来福士广场" },
    { acceptedNames: ["上海正大广场", "正大广场"], category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海正大广场" },
    { acceptedNames: ["上海环球港", "环球港"], category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海环球港" },
    { acceptedNames: ["上海五角场合生汇", "五角场合生汇"], category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海五角场合生汇" },
    { acceptedNames: ["上海七宝万科广场", "七宝万科广场"], category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海七宝万科广场" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海前滩太古里" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海万象城" },
    { category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海世博天地" },
    { acceptedNames: ["上海百联又一城", "百联又一城购物中心"], category: "commerce.large_mall", classificationStatus: "candidate", keywords: "上海百联又一城" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "世纪公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "共青森林公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "顾村公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "上海植物园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "滨江森林公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "辰山植物园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "东平国家森林公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "佘山国家森林公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "上海海湾国家森林公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "闵行文化公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "长风公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "中山公园" },
    { category: "park.major_city_park", classificationStatus: "candidate", keywords: "复兴公园" },
    { allPages: true, category: "park.neighborhood_park", classificationStatus: "inferred", keywords: "口袋公园" },
    { allPages: true, category: "park.neighborhood_park", classificationStatus: "inferred", keywords: "街心公园" },
    { allPages: true, category: "park.neighborhood_park", classificationStatus: "inferred", keywords: "街区公园" },
    { allPages: true, category: "park.neighborhood_park", classificationStatus: "inferred", keywords: "小公园" },
    { allPages: true, category: "community.civic_service_center", classificationStatus: "candidate", keywords: "社区文化中心" },
    { allPages: true, category: "community.civic_service_center", classificationStatus: "candidate", keywords: "社区文化活动中心" },
    { allPages: true, category: "community.civic_service_center", classificationStatus: "candidate", keywords: "党群服务中心" },
  ],
};

export function validAmapCollectionProfiles(): string[] { return Object.keys(PROFILES); }

export async function collectAmapFacilities(snapshot: string, profile: string): Promise<AmapCollectedFacilityRecord[]> {
  const queries = PROFILES[profile];
  if (!queries) throw new Error(`Unknown collection profile: ${profile}. Valid profiles: ${validAmapCollectionProfiles().join(", ")}`);
  const directory = join("data", "interim", snapshot);
  const outputFile = join(directory, `amap-${profile}.json`);
  const existing = await loadExisting(outputFile);
  const records = new Map(existing.map((record) => [record.sourceId, record]));
  const client = new AmapClient();

  for (const query of queries) {
    if (profile === "city-amenities" && [...records.values()].some((record) => record.searchEvidence.includes(query.keywords))) {
      console.error(`Amap ${profile}: ${query.keywords} already checkpointed`);
      continue;
    }
    console.error(`Amap ${profile}: ${query.keywords}`);
    const input = { city: "上海市", cityLimit: true, keywords: query.keywords, types: query.types };
    const result = query.allPages ?? profile !== "city-amenities"
      ? await client.searchAllText(input)
      : await client.searchText(input);
    console.error(`Amap ${profile}: ${query.keywords} returned ${result.count} POIs`);
    for (const poi of result.pois) {
      if (!isAccepted(profile, poi, query)) continue;
      const incoming = toRecord(poi, query);
      const present = records.get(incoming.sourceId);
      records.set(incoming.sourceId, present ? mergeEvidence(present, incoming) : incoming);
      if (profile === "city-amenities" && !query.allPages) break;
    }
    await persist(directory, outputFile, records);
  }
  return ordered(records);
}

function isAccepted(profile: string, poi: AmapPoi, query: Query): boolean {
  if (!poi.id || !poi.location) return false;
  if (profile === "metro") return poi.typecode.split("|").some((value) => value.startsWith("150500"));
  if (profile === "primary-care") return /社区卫生服务(中心|站|分中心)/.test(poi.name);
  if (profile === "city-amenities") return isAcceptedCityAmenity(poi, query);
  return poi.typecode.split("|").some((value) => value.startsWith("09"));
}

function isAcceptedCityAmenity(poi: AmapPoi, query: Query): boolean {
  const typeCodes = poi.typecode.split("|");
  const hasType = (prefix: string): boolean => typeCodes.some((typeCode) => typeCode.startsWith(prefix));
  const matchesQueryName = (): boolean => {
    const normalizedPoiName = normalizeForMatch(poi.name);
    return (query.acceptedNames ?? [query.keywords]).some((name) => normalizedPoiName === normalizeForMatch(name));
  };

  if (query.category === "commerce.big_box_retail") {
    const normalizedQuery = normalizeForMatch(query.keywords);
    return hasType("06")
      && normalizeForMatch(poi.name).startsWith(normalizedQuery)
      && !/总部|培训|礼品馆|落客|收货|仓|配送|厨房|公司/.test(poi.name);
  }
  if (query.category === "transport.railway_station") return hasType("150200");
  if (query.category === "transport.airport") {
    return hasType("150104") && /^(上海浦东国际机场|上海虹桥国际机场)$/.test(poi.name);
  }
  if (query.category === "commerce.large_mall") return hasType("06") && matchesQueryName();
  if (query.category === "landmark.city_landmark") return !hasType("15") && matchesQueryName();
  if (query.category === "culture.concert_hall") return !hasType("15") && matchesQueryName();
  if (query.category === "park.major_city_park") {
    return hasType("11") && (matchesQueryName() || normalizeForMatch(poi.name).endsWith(normalizeForMatch(query.keywords)));
  }
  if (query.category === "park.neighborhood_park") {
    return hasType("1101") && /(口袋|街心|街区|小).*公园/.test(poi.name);
  }
  if (query.category === "community.civic_service_center") {
    return /(社区.*文化.*(活动)?中心|党群.*服务中心)/.test(poi.name);
  }
  return false;
}

function normalizeForMatch(value: string): string {
  return value.replace(/[\s·()（）]/g, "").toLocaleLowerCase("zh-CN");
}

function toRecord(poi: AmapPoi, query: Query): AmapCollectedFacilityRecord {
  return {
    address: poi.address,
    amap: { location: poi.location, poiId: poi.id, type: poi.type, typeCode: poi.typecode },
    category: inferCategory(query.category, poi.name),
    classificationStatus: query.classificationStatus,
    district: poi.adname,
    name: poi.name,
    searchEvidence: [query.keywords],
    sourceId: `amap:${poi.id}`,
    sourceUrl: `https://www.amap.com/place/${poi.id}`,
  };
}

function inferCategory(category: string, name: string): string {
  if (!category.startsWith("primary_care.")) return category;
  if (name.includes("分中心")) return "primary_care.community_subcenter";
  if (name.includes("服务站")) return "primary_care.community_station";
  return "primary_care.community_center";
}

function mergeEvidence(present: AmapCollectedFacilityRecord, incoming: AmapCollectedFacilityRecord): AmapCollectedFacilityRecord {
  const evidence = [...new Set([...present.searchEvidence, ...incoming.searchEvidence])];
  const category = categoryRank(incoming.category) > categoryRank(present.category) ? incoming.category : present.category;
  return { ...present, category, searchEvidence: evidence };
}

function categoryRank(category: string): number {
  if (category.endsWith("station")) return 3;
  if (category.endsWith("subcenter")) return 2;
  return 1;
}

async function loadExisting(file: string): Promise<AmapCollectedFacilityRecord[]> {
  try { return JSON.parse(await readFile(file, "utf8")) as AmapCollectedFacilityRecord[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}

async function persist(directory: string, file: string, records: Map<string, AmapCollectedFacilityRecord>): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(file, `${JSON.stringify(ordered(records), null, 2)}\n`, "utf8");
}

function ordered(records: Map<string, AmapCollectedFacilityRecord>): AmapCollectedFacilityRecord[] {
  return [...records.values()].sort((left, right) =>
    left.category.localeCompare(right.category, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"));
}
