import { requireAmapWebKey } from "../config/env.js";
import type {
  AmapGeocodeResult,
  AmapBusLine,
  AmapPoi,
  AmapTextSearchInput,
  AmapTextSearchResult,
} from "../domain/amap.js";

const AMAP_BASE_URL = "https://restapi.amap.com";

type AmapEnvelope<T> = {
  count?: string;
  geocodes?: Array<{
    adcode?: string;
    formatted_address?: string;
    level?: string;
    location?: string;
  }>;
  infocode?: string;
  info?: string;
  pois?: Array<Partial<AmapPoi>>;
  buslines?: Array<Partial<AmapBusLine> & { busstops?: Array<Partial<import("../domain/amap.js").AmapBusStop>> }>;
  status?: string;
};

export class AmapApiError extends Error {
  public constructor(
    message: string,
    public readonly infoCode?: string,
  ) {
    super(message);
    this.name = "AmapApiError";
  }
}

export class AmapClient {
  private lastRequestAt = 0;

  public constructor(
    private readonly minimumRequestIntervalMs = 1100,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  public async searchText(input: AmapTextSearchInput): Promise<AmapTextSearchResult> {
    const pageSize = Math.min(Math.max(input.pageSize ?? 25, 1), 25);
    const params = new URLSearchParams({
      city: input.city ?? "上海市",
      citylimit: String(input.cityLimit ?? true),
      extensions: "base",
      key: requireAmapWebKey(),
      keywords: input.keywords,
      offset: String(pageSize),
      page: String(input.page ?? 1),
    });

    if (input.types) {
      params.set("types", input.types);
    }

    const response = await this.request<AmapEnvelope<unknown>>(
      "/v3/place/text",
      params,
    );

    return {
      count: Number.parseInt(response.count ?? "0", 10) || 0,
      pois: (response.pois ?? []).map(normalizePoi),
    };
  }

  public async geocode(address: string, city = "上海市"): Promise<AmapGeocodeResult[]> {
    const params = new URLSearchParams({
      address,
      city,
      key: requireAmapWebKey(),
    });
    const response = await this.request<AmapEnvelope<unknown>>(
      "/v3/geocode/geo",
      params,
    );

    return (response.geocodes ?? [])
      .filter((item) => item.location)
      .map((item) => ({
        adcode: item.adcode ?? "",
        formattedAddress: item.formatted_address ?? "",
        level: item.level ?? "",
        location: item.location ?? "",
      }));
  }

  public async searchBusLines(keywords: string, city = "上海市"): Promise<AmapBusLine[]> {
    const params = new URLSearchParams({ city, key: requireAmapWebKey(), keywords, offset: "20", page: "1" });
    const response = await this.request<AmapEnvelope<unknown>>("/v3/bus/linename", params);
    return (response.buslines ?? []).map(normalizeBusLine);
  }

  public async getBusLine(id: string): Promise<AmapBusLine | null> {
    const params = new URLSearchParams({ extensions: "all", id, key: requireAmapWebKey() });
    const response = await this.request<AmapEnvelope<unknown>>("/v3/bus/lineid", params);
    const line = response.buslines?.[0];
    return line ? normalizeBusLine(line) : null;
  }

  /** Fetch every available page for one text query (Amap returns at most 25 POIs per page). */
  public async searchAllText(input: Omit<AmapTextSearchInput, "page" | "pageSize">): Promise<AmapTextSearchResult> {
    const first = await this.searchText({ ...input, page: 1, pageSize: 25 });
    const pages = Math.ceil(first.count / 25);
    const pois = [...first.pois];
    for (let page = 2; page <= pages; page += 1) {
      const result = await this.searchText({ ...input, page, pageSize: 25 });
      pois.push(...result.pois);
    }
    return { count: first.count, pois };
  }

  private async request<T extends AmapEnvelope<unknown>>(
    pathname: string,
    params: URLSearchParams,
  ): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.requestOnce<T>(pathname, params);
      } catch (error) {
        const canRetry = error instanceof AmapApiError
          && error.infoCode === "CUQPS_HAS_EXCEEDED_THE_LIMIT"
          && attempt < 3;
        if (!canRetry) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
      }
    }

    throw new AmapApiError("Amap API request exhausted its retry budget.");
  }

  private async requestOnce<T extends AmapEnvelope<unknown>>(
    pathname: string,
    params: URLSearchParams,
  ): Promise<T> {
    await this.waitForRateLimit();
    const response = await this.fetchImplementation(`${AMAP_BASE_URL}${pathname}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new AmapApiError(`Amap HTTP request failed with ${response.status}.`);

    const payload = (await response.json()) as T;
    if (payload.status !== "1") {
      throw new AmapApiError(`Amap API request failed: ${payload.info ?? "unknown error"}.`, payload.infocode);
    }
    return payload;
  }

  private async waitForRateLimit(): Promise<void> {
    const waitMs = this.minimumRequestIntervalMs - (Date.now() - this.lastRequestAt);
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
  }
}

function normalizePoi(poi: Partial<AmapPoi>): AmapPoi {
  return {
    address: asString(poi.address),
    adcode: asString(poi.adcode),
    adname: asString(poi.adname),
    id: asString(poi.id),
    location: asString(poi.location),
    name: asString(poi.name),
    type: asString(poi.type),
    typecode: asString(poi.typecode),
  };
}

function normalizeBusLine(line: Partial<AmapBusLine> & { busstops?: Array<Partial<import("../domain/amap.js").AmapBusStop>> }): AmapBusLine {
  return {
    busstops: (line.busstops ?? []).map((stop) => ({ id: asString(stop.id), location: asString(stop.location), name: asString(stop.name) })),
    citycode: asString(line.citycode), company: asString(line.company), id: asString(line.id), name: asString(line.name), type: asString(line.type),
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
