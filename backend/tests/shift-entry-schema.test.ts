import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDirectory = path.join(workspaceRoot, "packages", "db", "migrations");
const migrationName = "015_create_shift_entries.ts";

async function readMigration(): Promise<string> {
  return readFile(path.join(migrationsDirectory, migrationName), "utf8");
}

test("SE-S1: migration 015 follows 014 in lexical order", async () => {
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".ts")).sort();
  const index = files.indexOf(migrationName);
  assert.ok(index > 0);
  assert.equal(files[index - 1], "014_create_report_definitions_and_executions.ts");
});

test("SE-S2: creates and drops tables in dependency order", async () => {
  const source = await readMigration();
  assert.match(
    source,
    /createTable\("truck_types"\)[\s\S]*createTable\("shift_entries"\)[\s\S]*createTable\("shift_entry_depots"\)[\s\S]*createTable\("shift_entry_truck_types"\)/
  );
  assert.match(
    source,
    /dropTable\("shift_entry_truck_types"\)[\s\S]*dropTable\("shift_entry_depots"\)[\s\S]*dropTable\("shift_entries"\)[\s\S]*dropTable\("truck_types"\)/
  );
});

test("SE-S3: shift_entries reuses employees and enforces non-negative counts and ordered times", async () => {
  const source = await readMigration();
  assert.match(source, /addColumn\("employee_id", "uuid", \(column\) => column\.notNull\(\)\.references\("employees\.id"\)/);
  assert.match(source, /shift_entries_end_after_start", sql`shift_end > shift_start`/);
  assert.match(source, /labour_count >= 0/);
  assert.match(source, /unloading_total >= 0/);
  assert.match(source, /loading_total >= 0/);
  assert.match(source, /shift_entries_employee_work_date_unique", \["employee_id", "work_date"\]/);
});

test("SE-S4: warehouse association reuses depots without copying name or code", async () => {
  const source = await readMigration();
  assert.match(source, /references\("depots\.id"\)/);
  const depotsBlock = source.slice(source.indexOf('createTable("shift_entry_depots")'), source.indexOf('createTable("shift_entry_truck_types")'));
  assert.doesNotMatch(depotsBlock, /addColumn\("(name|code)"/);
});

test("SE-S5: truck types are normalised, unique by code and seeded", async () => {
  const source = await readMigration();
  assert.match(source, /truck_types_code_unique", \["code"\]/);
  assert.match(source, /'32FT'/);
  assert.match(source, /'CROSSING'/);
  assert.match(source, /'OTHER'/);
  assert.match(source, /references\("truck_types\.id"\)/);
});

test("SE-S6: migration does not alter the pre-existing shifts template table", async () => {
  const source = await readMigration();
  assert.doesNotMatch(source, /alterTable\("shifts"\)/);
  assert.doesNotMatch(source, /dropTable\("shifts"\)/);
});
