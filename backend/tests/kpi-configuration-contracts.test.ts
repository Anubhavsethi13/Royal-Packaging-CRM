import assert from "node:assert/strict";
import test from "node:test";
import { isTargetCurrent, kpiDefinitionStatus, listKpiDefinitionsFilterSchema } from "../packages/contracts/src/kpi-reports/configuration.js";

const now = new Date("2026-09-30T12:00:00Z");
const before = new Date("2026-01-01T00:00:00Z");
const after = new Date("2027-01-01T00:00:00Z");

test("KC-C1: definition status derives from the active flag and effective range", () => {
  assert.equal(kpiDefinitionStatus({ active: true, effective_from: null, effective_to: null }, now), "ACTIVE");
  assert.equal(kpiDefinitionStatus({ active: true, effective_from: before, effective_to: after }, now), "ACTIVE");
  assert.equal(kpiDefinitionStatus({ active: true, effective_from: after, effective_to: null }, now), "SCHEDULED");
  assert.equal(kpiDefinitionStatus({ active: true, effective_from: null, effective_to: before }, now), "EXPIRED");
  assert.equal(kpiDefinitionStatus({ active: false, effective_from: before, effective_to: after }, now), "INACTIVE");
  // Boundaries are inclusive.
  assert.equal(kpiDefinitionStatus({ active: true, effective_from: now, effective_to: now }, now), "ACTIVE");
});

test("KC-C2: a target is current inside its effective range", () => {
  assert.equal(isTargetCurrent({ effective_from: before, effective_to: null }, now), true);
  assert.equal(isTargetCurrent({ effective_from: before, effective_to: before }, now), false);
  assert.equal(isTargetCurrent({ effective_from: after, effective_to: null }, now), false);
  assert.equal(isTargetCurrent({ effective_from: now, effective_to: now }, now), true);
});

test("KC-C3: list filter validates status and bounds search", () => {
  assert.equal(listKpiDefinitionsFilterSchema.safeParse({}).success, true);
  assert.equal(listKpiDefinitionsFilterSchema.safeParse({ status: "SCHEDULED", pillar: "productivity", search: "box" }).success, true);
  assert.equal(listKpiDefinitionsFilterSchema.safeParse({ status: "DRAFT" }).success, false);
  assert.equal(listKpiDefinitionsFilterSchema.safeParse({ search: "x".repeat(101) }).success, false);
  assert.equal(listKpiDefinitionsFilterSchema.safeParse({ pillar: "  " }).success, false);
});
