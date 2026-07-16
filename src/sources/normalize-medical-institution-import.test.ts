import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { normalizeMedicalInstitutionImport } from "./normalize-medical-institution-import.js";

const snapshot = "test-medical-import";
let directory = "";

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  await rm(join("data", "interim", snapshot), { recursive: true, force: true });
});

test("normalizes Chinese headers and only emits explicit grade candidates", async () => {
  directory = await mkdtemp(join(tmpdir(), "shanghai-facilities-"));
  const input = join(directory, "medical-institutions.csv");
  await writeFile(input, [
    "医院名称,结算等级,地址,所属区",
    "上海甲医院,三级甲等,\"新闸路, 1号\",静安区",
    "上海乙医院,二甲,浦东大道2号,浦东新区",
    "上海丙医院,三级,徐汇路3号,徐汇区",
  ].join("\n"), "utf8");

  const records = await normalizeMedicalInstitutionImport(snapshot, input);

  expect(records).toHaveLength(3);
  expect(records.map((record) => record.categoryCandidate)).toEqual([
    "hospital.tertiary_a", "hospital.secondary_a", null,
  ]);
  expect(records[0]).toMatchObject({ address: "新闸路, 1号", district: "静安区" });
  const saved = JSON.parse(await readFile(join("data", "interim", snapshot, "medical-institutions-import.json"), "utf8"));
  expect(saved).toEqual(records);
});
