import assert from "node:assert/strict";
import test from "node:test";

import {
  createDatabase,
  destroyDatabase,
  type PoolFactory
} from "../packages/db/src/index.js";

test("creates a Kysely PostgreSQL dialect from validated database configuration", async () => {
  let receivedConnectionString: string | undefined;
  let poolEndCalls = 0;

  const poolFactory: PoolFactory = (connectionString) => {
    receivedConnectionString = connectionString;

    return {
      end: async () => {
        poolEndCalls += 1;
      }
    } as ReturnType<PoolFactory>;
  };

  const database = createDatabase(
    {
      DATABASE_URL: "postgresql://royal:secret@localhost:5432/royal_packaging"
    },
    poolFactory
  );

  assert.equal(
    receivedConnectionString,
    "postgresql://royal:secret@localhost:5432/royal_packaging"
  );

  await destroyDatabase(database);

  // Kysely initializes its PostgreSQL driver on first query. A foundation
  // instance closed before use has no acquired connection to release.
  assert.equal(poolEndCalls, 0);
});
