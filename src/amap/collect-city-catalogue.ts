import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AmapClient } from "./client.js";
import type { AmapPoi } from "../domain/amap.js";
import type { AmapCollectedFacilityRecord } from "../domain/facility.js";

type Query = {
  category: string;
  keywords: string;
  allPages?: boolean;
  accepts: (poi: AmapPoi) => boolean;
};

const hasType = (poi: AmapPoi, prefix: string): boolean => poi.typecode.split("|").some((code) => code.startsWith(prefix));
const named = (pattern: RegExp) => (poi: AmapPoi): boolean => Boolean(poi.id && poi.location && pattern.test(poi.name));
const typedNamed = (type: string, pattern: RegExp) => (poi: AmapPoi): boolean => hasType(poi, type) && named(pattern)(poi);

const BEIJING_QUERIES: Query[] = [
  { category: "culture.museum", keywords: "博物馆", allPages: true, accepts: typedNamed("140100", /博物馆|纪念馆|展览馆/) },
  { category: "culture.art_gallery", keywords: "美术馆", allPages: true, accepts: named(/美术馆|艺术馆|画廊|艺术中心/) },
  { category: "library.district", keywords: "图书馆", allPages: true, accepts: named(/图书馆|书屋|阅读空间/) },
  { category: "culture.concert_hall", keywords: "音乐厅", allPages: true, accepts: named(/音乐厅|音乐堂|大剧院|剧院|演艺中心|艺术中心/) },
  { category: "hospital.tertiary_a", keywords: "三级甲等医院", allPages: true, accepts: typedNamed("09", /医院/) },
  { category: "hospital.secondary_a", keywords: "二级甲等医院", allPages: true, accepts: typedNamed("09", /医院/) },
  { category: "primary_care.community_center", keywords: "社区卫生服务中心", allPages: true, accepts: typedNamed("09", /社区卫生服务(中心|站|分中心)/) },
  { category: "commerce.big_box_retail", keywords: "山姆会员商店", accepts: typedNamed("06", /山姆会员商店/) },
  { category: "commerce.big_box_retail", keywords: "麦德龙", accepts: typedNamed("06", /麦德龙/) },
  { category: "commerce.big_box_retail", keywords: "宜家家居", accepts: typedNamed("06", /宜家/) },
  { category: "commerce.big_box_retail", keywords: "开市客", accepts: typedNamed("06", /开市客|Costco/i) },
  { category: "commerce.large_mall", keywords: "购物中心", allPages: true, accepts: typedNamed("06", /购物中心|广场|万象|合生汇|大悦城|太古里|来福士|SKP|国贸商城/) },
  { category: "transport.railway_station", keywords: "北京站", accepts: typedNamed("150200", /北京站/) },
  { category: "transport.railway_station", keywords: "北京西站", accepts: typedNamed("150200", /北京西站/) },
  { category: "transport.railway_station", keywords: "北京南站", accepts: typedNamed("150200", /北京南站/) },
  { category: "transport.railway_station", keywords: "北京北站", accepts: typedNamed("150200", /北京北站/) },
  { category: "transport.railway_station", keywords: "北京朝阳站", accepts: typedNamed("150200", /北京朝阳站/) },
  { category: "transport.railway_station", keywords: "北京丰台站", accepts: typedNamed("150200", /北京丰台站/) },
  { category: "transport.railway_station", keywords: "北京大兴站", accepts: typedNamed("150200", /北京大兴站/) },
  { category: "transport.airport", keywords: "北京首都国际机场", accepts: typedNamed("150104", /北京首都国际机场/) },
  { category: "transport.airport", keywords: "北京大兴国际机场", accepts: typedNamed("150104", /北京大兴国际机场/) },
  { category: "landmark.city_landmark", keywords: "天安门", accepts: named(/^天安门$/) },
  { category: "landmark.city_landmark", keywords: "故宫博物院", accepts: named(/故宫博物院/) },
  { category: "landmark.city_landmark", keywords: "天坛公园", accepts: named(/^天坛公园$/) },
  { category: "landmark.city_landmark", keywords: "颐和园", accepts: named(/^颐和园$/) },
  { category: "landmark.city_landmark", keywords: "鸟巢", accepts: named(/国家体育场|鸟巢/) },
  { category: "landmark.city_landmark", keywords: "水立方", accepts: named(/国家游泳中心|水立方/) },
  { category: "landmark.city_landmark", keywords: "北京环球度假区", accepts: named(/北京环球度假区/) },
  { category: "landmark.city_landmark", keywords: "什刹海", accepts: named(/什刹海/) },
  { category: "landmark.city_landmark", keywords: "北京坊", accepts: named(/^北京坊$/) },
  { category: "landmark.city_landmark", keywords: "中国国际贸易中心", accepts: named(/中国国际贸易中心|国贸商城/) },
  { category: "park.major_city_park", keywords: "朝阳公园", accepts: typedNamed("11", /^朝阳公园$/) },
  { category: "park.major_city_park", keywords: "奥林匹克森林公园", accepts: typedNamed("11", /奥林匹克森林公园/) },
  { category: "park.major_city_park", keywords: "玉渊潭公园", accepts: typedNamed("11", /^玉渊潭公园$/) },
  { category: "park.major_city_park", keywords: "北海公园", accepts: typedNamed("11", /^北海公园$/) },
  { category: "park.major_city_park", keywords: "景山公园", accepts: typedNamed("11", /^景山公园$/) },
  { category: "park.major_city_park", keywords: "圆明园遗址公园", accepts: typedNamed("11", /圆明园/) },
  { category: "park.major_city_park", keywords: "温榆河公园", accepts: typedNamed("11", /温榆河公园/) },
  { category: "park.major_city_park", keywords: "北京植物园", accepts: typedNamed("11", /北京植物园|国家植物园/) },
  { category: "park.neighborhood_park", keywords: "口袋公园", allPages: true, accepts: typedNamed("1101", /(口袋|街心|街区|小).*公园/) },
  { category: "community.civic_service_center", keywords: "社区文化活动中心", allPages: true, accepts: named(/社区.*文化.*(活动)?中心/) },
  { category: "community.civic_service_center", keywords: "党群服务中心", allPages: true, accepts: named(/党群.*服务中心/) },
];

export async function collectCityCatalogue(snapshot: string, city = "北京市"): Promise<AmapCollectedFacilityRecord[]> {
  if (city !== "北京市") throw new Error(`Unsupported generic city catalogue: ${city}`);
  const directory = join("data", "interim", snapshot);
  const output = join(directory, "amap-city-catalogue.json");
  const records = new Map((await load(output)).map((record) => [record.sourceId, record]));
  const client = new AmapClient();

  for (const query of BEIJING_QUERIES) {
    if ([...records.values()].some((record) => record.searchEvidence.includes(query.keywords))) continue;
    console.error(`Amap ${city} catalogue: ${query.keywords}`);
    const result = query.allPages
      ? await client.searchAllText({ city, cityLimit: true, keywords: query.keywords })
      : await client.searchText({ city, cityLimit: true, keywords: query.keywords });
    console.error(`Amap ${city} catalogue: ${query.keywords} returned ${result.count} POIs`);
    for (const poi of result.pois) {
      if (!query.accepts(poi)) continue;
      const incoming = toRecord(poi, query);
      const present = records.get(incoming.sourceId);
      records.set(incoming.sourceId, present ? mergeEvidence(present, incoming) : incoming);
    }
    await persist(directory, output, records);
  }
  return ordered(records);
}

function toRecord(poi: AmapPoi, query: Query): AmapCollectedFacilityRecord {
  return {
    address: poi.address, amap: { location: poi.location, poiId: poi.id, type: poi.type, typeCode: poi.typecode },
    category: query.category, classificationStatus: "candidate", district: poi.adname, name: poi.name,
    searchEvidence: [query.keywords], sourceId: `amap:${poi.id}`, sourceUrl: `https://www.amap.com/place/${poi.id}`,
  };
}

function mergeEvidence(present: AmapCollectedFacilityRecord, incoming: AmapCollectedFacilityRecord): AmapCollectedFacilityRecord {
  return { ...present, searchEvidence: [...new Set([...present.searchEvidence, ...incoming.searchEvidence])].sort() };
}

async function load(file: string): Promise<AmapCollectedFacilityRecord[]> {
  try { return JSON.parse(await readFile(file, "utf8")) as AmapCollectedFacilityRecord[]; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
async function persist(directory: string, file: string, records: Map<string, AmapCollectedFacilityRecord>): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(file, `${JSON.stringify(ordered(records), null, 2)}\n`, "utf8");
}
function ordered(records: Map<string, AmapCollectedFacilityRecord>): AmapCollectedFacilityRecord[] {
  return [...records.values()].sort((left, right) => left.category.localeCompare(right.category, "zh-CN") || left.name.localeCompare(right.name, "zh-CN"));
}
