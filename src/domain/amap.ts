export type AmapPoi = {
  address: string;
  adcode: string;
  adname: string;
  id: string;
  location: string;
  name: string;
  type: string;
  typecode: string;
};

export type AmapTextSearchInput = {
  city?: string;
  cityLimit?: boolean;
  keywords: string;
  page?: number;
  pageSize?: number;
  types?: string;
};

export type AmapTextSearchResult = {
  count: number;
  pois: AmapPoi[];
};

export type AmapGeocodeResult = {
  adcode: string;
  formattedAddress: string;
  level: string;
  location: string;
};

export type AmapBusStop = {
  id: string;
  location: string;
  name: string;
};

export type AmapBusLine = {
  busstops: AmapBusStop[];
  citycode: string;
  company: string;
  id: string;
  name: string;
  type: string;
};
