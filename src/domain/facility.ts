export type CultureFacilityRecord = {
  address: string;
  category: string;
  district: string;
  name: string;
  sourceId: string;
  sourceUrl: string;
};

/** A directly collected Amap POI. Coordinates use the GCJ-02 coordinate system. */
export type AmapCollectedFacilityRecord = {
  address: string;
  amap: {
    location: string;
    poiId: string;
    type: string;
    typeCode: string;
  };
  category: string;
  /** Whether the category is an Amap search candidate or can be inferred from a POI type. */
  classificationStatus: "candidate" | "inferred";
  district: string;
  name: string;
  searchEvidence: string[];
  sourceId: string;
  sourceUrl: string;
};
