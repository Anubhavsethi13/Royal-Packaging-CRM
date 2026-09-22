import { sql, type Kysely } from "kysely";

import type { RoyalPackagingDatabase } from "../src/types.js";

export async function up(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema
    .createTable("depots")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("code", "text", (column) => column.notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addUniqueConstraint("depots_code_unique", ["code"])
    .addCheckConstraint("depots_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("depots_active_index")
    .on("depots")
    .column("active")
    .execute();

  await database.schema
    .createTable("locations")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("depot_id", "uuid", (column) => column.notNull().references("depots.id").onDelete("restrict"))
    .addColumn("parent_location_id", "uuid", (column) => column.references("locations.id").onDelete("restrict"))
    .addColumn("code", "text", (column) => column.notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("locations_parent_not_self", sql`parent_location_id is null or parent_location_id <> id`)
    .addCheckConstraint("locations_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("locations_depot_parent_index")
    .on("locations")
    .columns(["depot_id", "parent_location_id"])
    .execute();

  await sql`
    create function royal_packaging_prevent_location_cycle()
    returns trigger
    as $function$
    declare
      cycle_found boolean;
    begin
      perform pg_advisory_xact_lock(724913004);

      if new.parent_location_id is null then
        return new;
      end if;

      with recursive ancestors(id, parent_location_id) as (
        select id, parent_location_id
        from locations
        where id = new.parent_location_id
        union
        select location.id, location.parent_location_id
        from locations as location
        inner join ancestors on location.id = ancestors.parent_location_id
      )
      select exists(select 1 from ancestors where id = new.id)
      into cycle_found;

      if cycle_found then
        raise exception using
          errcode = '23514',
          message = 'locations.parent_location_id cannot create an ancestor cycle';
      end if;

      return new;
    end;
    $function$ language plpgsql
  `.execute(database);

  await sql`
    create constraint trigger locations_prevent_ancestor_cycle
    after insert or update of parent_location_id on locations
    deferrable initially deferred
    for each row
    execute function royal_packaging_prevent_location_cycle()
  `.execute(database);

  await database.schema
    .createTable("shifts")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("name", "text", (column) => column.notNull())
    .addColumn("start_time", "time", (column) => column.notNull())
    .addColumn("end_time", "time", (column) => column.notNull())
    .addColumn("active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("shifts_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createTable("employee_shift_assignments")
    .addColumn("id", "uuid", (column) => column.primaryKey().notNull())
    .addColumn("employee_id", "uuid", (column) => column.notNull().references("employees.id").onDelete("restrict"))
    .addColumn("shift_id", "uuid", (column) => column.notNull().references("shifts.id").onDelete("restrict"))
    .addColumn("effective_from", "date", (column) => column.notNull())
    .addColumn("effective_to", "date")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("version", "bigint", (column) => column.notNull().defaultTo(1))
    .addCheckConstraint("employee_shift_assignments_date_range", sql`effective_to is null or effective_to >= effective_from`)
    .addCheckConstraint("employee_shift_assignments_version_positive", sql`version >= 1`)
    .execute();

  await database.schema
    .createIndex("employee_shift_assignments_effective_lookup_index")
    .on("employee_shift_assignments")
    .columns(["employee_id", "effective_from", "effective_to"])
    .execute();

  await database.schema
    .createIndex("employee_shift_assignments_shift_effective_lookup_index")
    .on("employee_shift_assignments")
    .columns(["shift_id", "effective_from", "effective_to"])
    .execute();
}

export async function down(database: Kysely<RoyalPackagingDatabase>): Promise<void> {
  await database.schema.dropTable("employee_shift_assignments").execute();
  await database.schema.dropTable("shifts").execute();
  await sql`drop trigger locations_prevent_ancestor_cycle on locations`.execute(database);
  await sql`drop function royal_packaging_prevent_location_cycle()`.execute(database);
  await database.schema.dropTable("locations").execute();
  await database.schema.dropTable("depots").execute();
}
