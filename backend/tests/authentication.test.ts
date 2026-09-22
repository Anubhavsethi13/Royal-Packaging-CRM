import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthService,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashSessionToken,
  createSessionCookie,
  DEFAULT_SESSION_COOKIE_NAME,
  LOCKOUT_DURATION_MINUTES
} from "../apps/api/src/modules/identity/index.js";
import type { DatabaseConnection } from "../packages/db/src/index.js";

test("password hashing and verification", async () => {
  const plainPassword = "SuperSecretPassword123!";
  const hash = await hashPassword(plainPassword);

  assert.notEqual(hash, plainPassword);
  assert.match(hash, /^\$2[abxy]\$\d+\$/);

  const isValid = await verifyPassword(plainPassword, hash);
  assert.equal(isValid, true);

  const isInvalid = await verifyPassword("WrongPassword", hash);
  assert.equal(isInvalid, false);
});

test("session token generation and hashing", () => {
  const token1 = generateSessionToken();
  const token2 = generateSessionToken();

  assert.equal(typeof token1, "string");
  assert.equal(token1.length, 64); // 32 bytes in hex = 64 chars
  assert.notEqual(token1, token2);

  const hash1 = hashSessionToken(token1);
  const hash2 = hashSessionToken(token1);
  const hashOther = hashSessionToken(token2);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashOther);
  assert.notEqual(hash1, token1); // Hash is different from raw token
});

test("session cookie configuration enforces security defaults", () => {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // Development / Test configuration
  const devCookie = createSessionCookie(token, expiresAt, { isProduction: false });
  assert.equal(devCookie.name, DEFAULT_SESSION_COOKIE_NAME);
  assert.equal(devCookie.value, token);
  assert.equal(devCookie.httpOnly, true);
  assert.equal(devCookie.secure, false);
  assert.equal(devCookie.sameSite, "lax");
  assert.equal(devCookie.path, "/");
  assert.ok(devCookie.maxAge > 0);

  // Production configuration
  const prodCookie = createSessionCookie(token, expiresAt, { isProduction: true });
  assert.equal(prodCookie.httpOnly, true);
  assert.equal(prodCookie.secure, true);
  assert.equal(prodCookie.sameSite, "lax");
});

interface MockUser {
  id: string;
  login_identifier: string;
  password_hash: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockSession {
  id: string;
  user_id: string;
  session_token_hash: string;
  created_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
  last_seen_at: Date | null;
  version: string;
}

interface MockLoginAttempt {
  id: string;
  login_identifier: string;
  attempted_at: Date;
  succeeded: boolean;
  user_id: string | null;
  lockout_until: Date | null;
  correlation_id: string | null;
  created_at: Date;
}

interface FilterCondition {
  col: string;
  op: string;
  val: unknown;
}

// In-memory test fixture simulating PostgreSQL database state for AuthService
function createMockAuthDatabase() {
  const users: MockUser[] = [];
  const sessions: MockSession[] = [];
  const loginAttempts: MockLoginAttempt[] = [];

  const createQueryBuilder = (selectedTable: string) => {
    const filters: FilterCondition[] = [];
    let orderParams: { col: string; dir: string } | null = null;

    const builder = {
      innerJoin: () => builder,
      select: () => builder,
      where: (col: string, op: string, val: unknown) => {
        filters.push({ col, op, val });
        return builder;
      },
      orderBy: (col: string, dir: string) => {
        orderParams = { col, dir };
        return builder;
      },
      limit: () => builder,
      executeTakeFirst: async (): Promise<unknown> => {
        if (selectedTable === "login_attempts") {
          let results = [...loginAttempts];
          for (const f of filters) {
            if (f.col === "login_identifier" && f.op === "=") {
              results = results.filter((r) => r.login_identifier === f.val);
            }
            if (f.col === "lockout_until" && f.op === ">") {
              const valDate = f.val as Date;
              results = results.filter((r) => r.lockout_until && r.lockout_until > valDate);
            }
          }
          if (orderParams?.col === "lockout_until" && orderParams.dir === "desc") {
            results.sort((a, b) => (b.lockout_until?.getTime() ?? 0) - (a.lockout_until?.getTime() ?? 0));
          }
          return results[0];
        }

        if (selectedTable === "users") {
          let results = [...users];
          for (const f of filters) {
            if (f.col === "login_identifier" && f.op === "=") {
              results = results.filter((u) => u.login_identifier === f.val);
            }
          }
          return results[0];
        }

        if (selectedTable === "sessions") {
          const results = sessions.map((s) => {
            const u = users.find((usr) => usr.id === s.user_id);
            return {
              ...s,
              user_id: u?.id,
              login_identifier: u?.login_identifier,
              is_active: u?.is_active,
              user_created_at: u?.created_at,
              user_updated_at: u?.updated_at,
              session_id: s.id
            };
          });

          let filtered = results;
          for (const f of filters) {
            if (f.col === "sessions.session_token_hash" && f.op === "=") {
              filtered = filtered.filter((r) => r.session_token_hash === f.val);
            }
            if (f.col === "sessions.revoked_at" && f.op === "is" && f.val === null) {
              filtered = filtered.filter((r) => r.revoked_at === null);
            }
            if (f.col === "sessions.expires_at" && f.op === ">") {
              const valDate = f.val as Date;
              filtered = filtered.filter((r) => r.expires_at > valDate);
            }
            if (f.col === "users.is_active" && f.op === "=") {
              filtered = filtered.filter((r) => r.is_active === f.val);
            }
          }
          return filtered[0];
        }

        return undefined;
      },
      executeTakeFirstOrThrow: async () => {
        if (selectedTable === "login_attempts") {
          let results = [...loginAttempts];
          for (const f of filters) {
            if (f.col === "login_identifier" && f.op === "=") {
              results = results.filter((r) => r.login_identifier === f.val);
            }
            if (f.col === "succeeded" && f.op === "=") {
              results = results.filter((r) => r.succeeded === f.val);
            }
            if (f.col === "attempted_at" && f.op === ">=") {
              const valDate = f.val as Date;
              results = results.filter((r) => r.attempted_at >= valDate);
            }
          }
          return { failure_count: results.length };
        }
        throw new Error("Unexpected query");
      }
    };

    return builder;
  };

  const mockDb = {
    users,
    sessions,
    loginAttempts,
    transaction: () => ({
      execute: async <T>(callback: (trx: unknown) => Promise<T>): Promise<T> => {
        return callback(mockDb);
      }
    }),
    selectFrom: (table: string) => createQueryBuilder(table),
    insertInto: (table: string) => ({
      values: (val: unknown) => ({
        execute: async () => {
          if (table === "login_attempts") {
            loginAttempts.push(val as MockLoginAttempt);
          } else if (table === "sessions") {
            sessions.push(val as MockSession);
          }
          return {};
        }
      })
    }),
    updateTable: (table: string) => {
      let updateValues: Record<string, unknown> = {};
      const filters: FilterCondition[] = [];
      const updater = {
        set: (vals: Record<string, unknown>) => {
          updateValues = vals;
          return updater;
        },
        where: (col: string, op: string, val: unknown) => {
          filters.push({ col, op, val });
          return updater;
        },
        execute: async () => {
          return updater.executeTakeFirst();
        },
        executeTakeFirst: async () => {
          let updatedCount = 0;
          if (table === "sessions") {
            for (const s of sessions) {
              let match = true;
              for (const f of filters) {
                if (f.col === "session_token_hash" && s.session_token_hash !== f.val) match = false;
                if (f.col === "id" && s.id !== f.val) match = false;
                if (f.col === "user_id" && s.user_id !== f.val) match = false;
                if (f.col === "revoked_at" && f.op === "is" && f.val === null && s.revoked_at !== null) match = false;
              }
              if (match) {
                Object.assign(s, updateValues);
                updatedCount++;
              }
            }
          }
          return { numUpdatedRows: updatedCount };
        }
      };
      return updater;
    }
  };

  return mockDb as unknown as DatabaseConnection & { users: typeof users; sessions: typeof sessions; loginAttempts: typeof loginAttempts };
}

test("AuthService handles complete authentication lifecycle", async () => {
  const db = createMockAuthDatabase();
  const authService = new AuthService({ database: db });

  // 1. Seed active user
  const password = "ValidPassword123!";
  const passwordHash = await hashPassword(password);
  db.users.push({
    id: "11111111-1111-1111-1111-111111111111",
    login_identifier: "wh_operator_01",
    password_hash: passwordHash,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    version: "1"
  });

  // 2. Login with correct password succeeds
  const successResult = await authService.login({
    login_identifier: "wh_operator_01",
    password: "ValidPassword123!"
  });

  assert.equal(successResult.success, true);
  if (successResult.success) {
    assert.equal(successResult.user.login_identifier, "wh_operator_01");
    assert.equal(successResult.user.id, "11111111-1111-1111-1111-111111111111");
    assert.equal("password_hash" in successResult.user, false); // Never returns password hash
    assert.ok(successResult.sessionToken);
    assert.equal(successResult.cookie.httpOnly, true);
    assert.equal(successResult.cookie.sameSite, "lax");

    // 3. Validate active session resolves user
    const resolvedUser = await authService.validateSession(successResult.sessionToken);
    assert.ok(resolvedUser);
    assert.equal(resolvedUser.login_identifier, "wh_operator_01");
    assert.equal("password_hash" in resolvedUser, false);

    // 4. Logout / session revocation
    const revoked = await authService.revokeSession(successResult.sessionToken);
    assert.equal(revoked, true);

    // 5. Revoked session is rejected
    const afterRevokeUser = await authService.validateSession(successResult.sessionToken);
    assert.equal(afterRevokeUser, null);
  }
});

test("AuthService rejects wrong password and non-existent user with identical generic message", async () => {
  const db = createMockAuthDatabase();
  const authService = new AuthService({ database: db });

  const passwordHash = await hashPassword("RealPassword123!");
  db.users.push({
    id: "22222222-2222-2222-2222-222222222222",
    login_identifier: "existing_user",
    password_hash: passwordHash,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    version: "1"
  });

  // Attempt with non-existent user
  const nonExistentResult = await authService.login({
    login_identifier: "non_existent_user",
    password: "AnyPassword123!"
  });

  // Attempt with existing user but wrong password
  const wrongPasswordResult = await authService.login({
    login_identifier: "existing_user",
    password: "WrongPassword123!"
  });

  assert.equal(nonExistentResult.success, false);
  assert.equal(wrongPasswordResult.success, false);
  assert.equal(nonExistentResult.message, wrongPasswordResult.message);
  assert.equal(nonExistentResult.message, "Invalid login identifier or password");
});

test("AuthService enforces 5 failed attempts / 15 minutes lockout rule", async () => {
  const db = createMockAuthDatabase();
  const authService = new AuthService({ database: db });

  const passwordHash = await hashPassword("CorrectPassword123!");
  db.users.push({
    id: "33333333-3333-3333-3333-333333333333",
    login_identifier: "target_user",
    password_hash: passwordHash,
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
    version: "1"
  });

  const now = new Date();

  // Failures 1 to 4
  for (let i = 1; i <= 4; i++) {
    const res = await authService.login(
      { login_identifier: "target_user", password: "BadPassword!" },
      { now }
    );
    assert.equal(res.success, false);
    assert.equal(res.reason, "INVALID_CREDENTIALS");
  }

  // 5th failure triggers lockout
  const fifthAttempt = await authService.login(
    { login_identifier: "target_user", password: "BadPassword!" },
    { now }
  );
  assert.equal(fifthAttempt.success, false);
  assert.equal(fifthAttempt.reason, "ACCOUNT_LOCKED");
  assert.ok(fifthAttempt.lockoutUntil);
  assert.equal(
    fifthAttempt.lockoutUntil.getTime(),
    now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000
  );

  // Subsequent login attempt even with CORRECT password is rejected while locked out
  const lockedAttempt = await authService.login(
    { login_identifier: "target_user", password: "CorrectPassword123!" },
    { now: new Date(now.getTime() + 5 * 60 * 1000) } // 5 mins into 15 min lockout
  );
  assert.equal(lockedAttempt.success, false);
  assert.equal(lockedAttempt.reason, "ACCOUNT_LOCKED");

  // After lockout expires (16 minutes later), login with correct password succeeds
  const afterLockoutAttempt = await authService.login(
    { login_identifier: "target_user", password: "CorrectPassword123!" },
    { now: new Date(now.getTime() + 16 * 60 * 1000) }
  );
  assert.equal(afterLockoutAttempt.success, true);
});
