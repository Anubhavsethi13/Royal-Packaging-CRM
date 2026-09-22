import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Migration, MigrationProvider } from "kysely";
import { Migrator } from "kysely";

import type { DatabaseConnection } from "./index.js";

/** The sole migration location. Deployment invokes migration execution explicitly. */
export const migrationsDirectory = fileURLToPath(
  new URL("../migrations/", import.meta.url)
);

export class DynamicFileMigrationProvider implements MigrationProvider {
  public async getMigrations(): Promise<Record<string, Migration>> {
    const files = await fs.readdir(migrationsDirectory);
    const migrations: Record<string, Migration> = {};

    for (const file of files.sort()) {
      if (
        (file.endsWith(".ts") || file.endsWith(".js")) &&
        !file.endsWith(".d.ts")
      ) {
        const filePath = path.join(migrationsDirectory, file);
        const fileUrl = pathToFileURL(filePath).href;
        const migration = (await import(fileUrl)) as Migration;
        const migrationKey = file.substring(0, file.lastIndexOf("."));
        migrations[migrationKey] = migration;
      }
    }

    return migrations;
  }
}

export function createMigrator(database: DatabaseConnection): Migrator {
  return new Migrator({
    db: database,
    provider: new DynamicFileMigrationProvider()
  });
}
