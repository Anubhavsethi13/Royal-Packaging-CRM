import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyTaskType,
  listLocationsFilterSchema,
  listWarehouseOperationsFilterSchema,
  taskDisplayCode
} from "../packages/contracts/src/warehouse-operations/index.js";

test("WO-C1: known task types classify case-insensitively; everything else is OTHER", () => {
  assert.equal(classifyTaskType("LOADING"), "LOADING");
  assert.equal(classifyTaskType(" dispatch "), "LOADING");
  assert.equal(classifyTaskType("unloading"), "UNLOADING");
  assert.equal(classifyTaskType("Receiving"), "UNLOADING");
  assert.equal(classifyTaskType("PUTAWAY"), "PUTAWAY");
  assert.equal(classifyTaskType("pick"), "PICKING");
  assert.equal(classifyTaskType("PACKING"), "PACKING");
  assert.equal(classifyTaskType("WRAP"), "PACKING");
  // Never guessed: unmapped values and missing types are OTHER.
  for (const value of ["UNPACKING", "MOVE", "INTERNAL_MOVE", "REPACK", "SORT", "", "   ", null, undefined]) {
    assert.equal(classifyTaskType(value), "OTHER", String(value));
  }
});

test("WO-C2: display code is derived from the task id", () => {
  assert.equal(taskDisplayCode("3f2a9c1e-0000-4000-8000-000000000000"), "TSK-3F2A9C1E");
});

test("WO-C3: operations filter validates status, operation type, and employee id", () => {
  assert.equal(listWarehouseOperationsFilterSchema.safeParse({}).success, true);
  assert.equal(listWarehouseOperationsFilterSchema.safeParse({ status: "IN_PROGRESS", operation_type: "LOADING", warehouse_code: "DEP-01" }).success, true);
  assert.equal(listWarehouseOperationsFilterSchema.safeParse({ status: "STARTED" }).success, false);
  assert.equal(listWarehouseOperationsFilterSchema.safeParse({ operation_type: "DOCKING" }).success, false);
  assert.equal(listWarehouseOperationsFilterSchema.safeParse({ employee_id: "abc" }).success, false);
  assert.equal(listWarehouseOperationsFilterSchema.safeParse({ search: "x".repeat(101) }).success, false);
});

test("WO-C3b: operation_type accepts a comma-separated list, normalised and de-duplicated", () => {
  assert.deepEqual(listWarehouseOperationsFilterSchema.parse({ operation_type: "LOADING,unloading" }).operation_type, ["LOADING", "UNLOADING"]);
  assert.deepEqual(listWarehouseOperationsFilterSchema.parse({ operation_type: "loading, LOADING" }).operation_type, ["LOADING"]);
  assert.deepEqual(listWarehouseOperationsFilterSchema.parse({ operation_type: "OTHER" }).operation_type, ["OTHER"]);
  assert.equal(listWarehouseOperationsFilterSchema.safeParse({ operation_type: "LOADING,DOCKING" }).success, false);
  assert.equal(listWarehouseOperationsFilterSchema.safeParse({ operation_type: " , " }).success, false);
});

test("WO-C4: locations filter parses active as a boolean", () => {
  assert.deepEqual(listLocationsFilterSchema.parse({ active: "false" }), { active: false });
  assert.deepEqual(listLocationsFilterSchema.parse({ active: "true" }), { active: true });
  assert.equal(listLocationsFilterSchema.safeParse({ active: "yes" }).success, false);
});
