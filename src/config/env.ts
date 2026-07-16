import { config as loadDotenv } from "dotenv";

loadDotenv({ quiet: true });

export type EnvironmentStatus = {
  amapMcpKeyConfigured: boolean;
  amapWebKeyConfigured: boolean;
  nodeVersion: string;
};

export function getEnvironmentStatus(): EnvironmentStatus {
  return {
    amapMcpKeyConfigured: Boolean(process.env.AMAP_MCP_KEY?.trim()),
    amapWebKeyConfigured: Boolean(process.env.AMAP_WEB_KEY?.trim()),
    nodeVersion: process.version,
  };
}

export function requireAmapWebKey(): string {
  const key = process.env.AMAP_WEB_KEY?.trim();

  if (!key) {
    throw new Error(
      "AMAP_WEB_KEY is required for live Amap API calls. Copy .env.example to .env and set AMAP_WEB_KEY locally.",
    );
  }

  return key;
}
