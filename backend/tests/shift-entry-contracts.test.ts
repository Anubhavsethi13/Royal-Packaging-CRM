import assert from "node:assert/strict";
import test from "node:test";
import {
  createShiftEntryRequestSchema,
  isValidCalendarDate,
  listShiftEntriesFilterSchema,
  normalizeTime
} from "../packages/contracts/src/shift-entries/index.js";

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    work_date: "2026-09-28",
    shift_start: "08:00",
    shift_end: "16:30",
    labour_count: 6,
    unloading_total: 120,
    loading_total: 340,
    warehouses: [{ warehouse_code: "dep-01" }],
    truck_types: ["32ft", "crossing"],
    ...overrides
  };
}

function issuePaths(payload: unknown): string[] {
  const result = createShiftEntryRequestSchema.safeParse(payload);
  assert.equal(result.success, false);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

test("SE-C1: accepts a valid payload and normalises times and truck type codes", () => {
  const result = createShiftEntryRequestSchema.safeParse(validPayload());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.shift_start, "08:00:00");
    assert.equal(result.data.shift_end, "16:30:00");
    assert.deepEqual(result.data.truck_types, ["32FT", "CROSSING"]);
  }
});

test("SE-C2: truck_types is optional and defaults to an empty list", () => {
  const { truck_types: _omitted, ...rest } = validPayload();
  void _omitted;
  const result = createShiftEntryRequestSchema.safeParse(rest);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.truck_types, []);
  }
});

test("SE-C3: every required field is reported when missing", () => {
  const paths = issuePaths({});
  for (const field of ["work_date", "shift_start", "shift_end", "labour_count", "unloading_total", "loading_total", "warehouses"]) {
    assert.ok(paths.includes(field), `expected an issue for ${field}, got ${paths.join(",")}`);
  }
});

test("SE-C4: rejects impossible or malformed dates", () => {
  for (const bad of ["2026-02-30", "2026-13-01", "28-09-2026", "2026/09/28", "not-a-date", "", "2026-9-8"]) {
    assert.deepEqual(issuePaths(validPayload({ work_date: bad })), ["work_date"], `date ${bad}`);
  }
  assert.equal(isValidCalendarDate("2028-02-29"), true);
  assert.equal(isValidCalendarDate("2027-02-29"), false);
});

test("SE-C5: rejects malformed times", () => {
  for (const bad of ["25:00", "08:60", "8:00", "08", "noon", ""]) {
    assert.deepEqual(issuePaths(validPayload({ shift_start: bad })), ["shift_start"], `time ${bad}`);
  }
  assert.equal(normalizeTime("23:59:59"), "23:59:59");
  assert.equal(normalizeTime("24:00"), null);
});

test("SE-C6: end time must be later than start time (no overnight shifts in V1)", () => {
  assert.deepEqual(issuePaths(validPayload({ shift_start: "16:00", shift_end: "08:00" })), ["shift_end"]);
  assert.deepEqual(issuePaths(validPayload({ shift_start: "08:00", shift_end: "08:00:00" })), ["shift_end"]);
  assert.equal(createShiftEntryRequestSchema.safeParse(validPayload({ shift_start: "08:00", shift_end: "08:01" })).success, true);
});

test("SE-C7: labour, loading and unloading cannot be negative, fractional or non-numeric", () => {
  for (const field of ["labour_count", "loading_total", "unloading_total"]) {
    assert.deepEqual(issuePaths(validPayload({ [field]: -1 })), [field], `${field} negative`);
    assert.deepEqual(issuePaths(validPayload({ [field]: 1.5 })), [field], `${field} fractional`);
    assert.deepEqual(issuePaths(validPayload({ [field]: "10" })), [field], `${field} string`);
    assert.deepEqual(issuePaths(validPayload({ [field]: null })), [field], `${field} null`);
    assert.equal(createShiftEntryRequestSchema.safeParse(validPayload({ [field]: 0 })).success, true, `${field} zero allowed`);
  }
});

test("SE-C7b: counts beyond the 32-bit integer range are rejected instead of failing in the database", () => {
  assert.deepEqual(issuePaths(validPayload({ loading_total: 2_147_483_648 })), ["loading_total"]);
  assert.equal(createShiftEntryRequestSchema.safeParse(validPayload({ loading_total: 2_147_483_647 })).success, true);
});

test("SE-C8: at least one warehouse is required", () => {
  assert.deepEqual(issuePaths(validPayload({ warehouses: [] })), ["warehouses"]);
  assert.deepEqual(issuePaths(validPayload({ warehouses: "dep-01" })), ["warehouses"]);
  assert.deepEqual(issuePaths(validPayload({ warehouses: [{}] })), ["warehouses.0.warehouse_code"]);
});

test("SE-C9: duplicate warehouses and truck types are rejected", () => {
  assert.deepEqual(
    issuePaths(validPayload({ warehouses: [{ warehouse_code: "DEP-01" }, { warehouse_code: "dep-01" }] })),
    ["warehouses.1.warehouse_code"]
  );
  assert.deepEqual(issuePaths(validPayload({ truck_types: ["32FT", "32ft"] })), ["truck_types.1"]);
});

test("SE-C10: a client-supplied employee_id (or any unknown field) is rejected, not silently trusted", () => {
  const result = createShiftEntryRequestSchema.safeParse(validPayload({ employee_id: crypto.randomUUID() }));
  assert.equal(result.success, false);
  assert.ok(!result.success && result.error.issues.some((issue) => issue.code === "unrecognized_keys"));
});

test("SE-C11: list filter validates dates and ordering", () => {
  assert.equal(listShiftEntriesFilterSchema.safeParse({ from: "2026-09-01", to: "2026-09-30" }).success, true);
  assert.equal(listShiftEntriesFilterSchema.safeParse({}).success, true);
  assert.equal(listShiftEntriesFilterSchema.safeParse({ from: "2026-09-30", to: "2026-09-01" }).success, false);
  assert.equal(listShiftEntriesFilterSchema.safeParse({ from: "2026-02-31" }).success, false);
});
