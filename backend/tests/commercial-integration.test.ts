import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import type { DatabaseConnection } from "@royal-packaging/db";
import { CommercialDomainError } from "@royal-packaging/contracts";
import { ClientsService } from "../apps/api/src/modules/clients/clients-service.js";
import { OrdersService } from "../apps/api/src/modules/orders/orders-service.js";
import { OrganizationService } from "../apps/api/src/modules/organization/organization-service.js";
import {
  ensureTestDatabase,
  getScopedTestDatabaseUrl,
  getTestDatabase,
  migrateTestDatabase,
  truncateAllTables,
  cleanupTestDatabase
} from "./helpers/postgres-test-helper.js";

const TEST_DATABASE_URL = getScopedTestDatabaseUrl(import.meta.url);

let db: DatabaseConnection;
let clientsService: ClientsService;
let ordersService: OrdersService;
let organizationService: OrganizationService;
let testDepotId: string;
let testShiftId: string;

before(async () => {
  await ensureTestDatabase(TEST_DATABASE_URL);
  db = getTestDatabase(TEST_DATABASE_URL);
  await migrateTestDatabase(db);

  clientsService = new ClientsService({ database: db });
  ordersService = new OrdersService({ database: db });
  organizationService = new OrganizationService({ database: db });
});

after(async () => {
  if (db) {
    await cleanupTestDatabase(db);
  }
});

beforeEach(async () => {
  await truncateAllTables(db);

  testDepotId = crypto.randomUUID();
  await db
    .insertInto("depots")
    .values({ id: testDepotId, code: "DEP-01", name: "Main Depot", active: true })
    .execute();

  testShiftId = crypto.randomUUID();
  await db
    .insertInto("shifts")
    .values({
      id: testShiftId,
      name: "Morning Shift",
      start_time: "08:00:00",
      end_time: "16:00:00",
      active: true
    })
    .execute();
});

test("CO1: creates a client with a unique account_code", async () => {
  const client = await clientsService.createClient({
    name: "Acme Packaging",
    account_code: "ACME-001"
  });

  assert.equal(client.name, "Acme Packaging");
  assert.equal(client.account_code, "ACME-001");
  assert.equal(client.status, "active");
});

test("CO2: duplicate account_code is translated to a CommercialDomainError", async () => {
  await clientsService.createClient({ name: "Acme Packaging", account_code: "ACME-001" });

  await assert.rejects(
    () => clientsService.createClient({ name: "Acme Packaging 2", account_code: "ACME-001" }),
    (err: unknown) => {
      assert.ok(err instanceof CommercialDomainError);
      assert.equal(err.code, "DUPLICATE_ACCOUNT_CODE");
      return true;
    }
  );
});

test("CO3: updates a client", async () => {
  const client = await clientsService.createClient({ name: "Acme Packaging", account_code: "ACME-001" });
  const updated = await clientsService.updateClient(client.id, { contact_name: "Jane Doe", status: "inactive" });

  assert.equal(updated.contact_name, "Jane Doe");
  assert.equal(updated.status, "inactive");
  assert.equal(updated.version, 2n);
});

test("CO4: updating an unknown client raises CLIENT_NOT_FOUND", async () => {
  await assert.rejects(
    () => clientsService.updateClient(crypto.randomUUID(), { contact_name: "X" }),
    (err: unknown) => {
      assert.ok(err instanceof CommercialDomainError);
      assert.equal(err.code, "CLIENT_NOT_FOUND");
      return true;
    }
  );
});

test("CO5: lists clients filtered by status and search", async () => {
  await clientsService.createClient({ name: "Acme Packaging", account_code: "ACME-001" });
  await clientsService.createClient({ name: "Beta Boxes", account_code: "BETA-001", status: "inactive" });

  const activeOnly = await clientsService.listClients({ status: "active" });
  assert.equal(activeOnly.length, 1);
  assert.equal(activeOnly[0]?.account_code, "ACME-001");

  const searched = await clientsService.listClients({ search: "Beta" });
  assert.equal(searched.length, 1);
  assert.equal(searched[0]?.account_code, "BETA-001");
});

test("CO6: creates an order in draft status against an existing client", async () => {
  const client = await clientsService.createClient({ name: "Acme Packaging", account_code: "ACME-001" });
  const order = await ordersService.createOrder({
    client_id: client.id,
    order_code: "ORD-100",
    material_name: "Corrugated Sheet",
    quantity: 500,
    unit: "BOX"
  });

  assert.equal(order.status, "draft");
  assert.equal(order.priority, "normal");
  assert.equal(order.quantity, 500n);
});

test("CO7: creating an order against an unknown client raises CLIENT_NOT_FOUND", async () => {
  await assert.rejects(
    () =>
      ordersService.createOrder({
        client_id: crypto.randomUUID(),
        order_code: "ORD-100"
      }),
    (err: unknown) => {
      assert.ok(err instanceof CommercialDomainError);
      assert.equal(err.code, "CLIENT_NOT_FOUND");
      return true;
    }
  );
});

test("CO8: duplicate order_code is translated to a CommercialDomainError", async () => {
  const client = await clientsService.createClient({ name: "Acme Packaging", account_code: "ACME-001" });
  await ordersService.createOrder({ client_id: client.id, order_code: "ORD-100" });

  await assert.rejects(
    () => ordersService.createOrder({ client_id: client.id, order_code: "ORD-100" }),
    (err: unknown) => {
      assert.ok(err instanceof CommercialDomainError);
      assert.equal(err.code, "DUPLICATE_ORDER_CODE");
      return true;
    }
  );
});

test("CO9: valid forward-only status transitions succeed and invalid ones are rejected", async () => {
  const client = await clientsService.createClient({ name: "Acme Packaging", account_code: "ACME-001" });
  const order = await ordersService.createOrder({ client_id: client.id, order_code: "ORD-100" });

  const confirmed = await ordersService.updateOrder(order.id, { status: "confirmed" });
  assert.equal(confirmed.status, "confirmed");

  await assert.rejects(
    () => ordersService.updateOrder(order.id, { status: "dispatched" }),
    (err: unknown) => {
      assert.ok(err instanceof CommercialDomainError);
      assert.equal(err.code, "INVALID_STATUS_TRANSITION");
      return true;
    }
  );
});

test("CO10: an order can be cancelled before dispatch but not after", async () => {
  const client = await clientsService.createClient({ name: "Acme Packaging", account_code: "ACME-001" });
  const order = await ordersService.createOrder({ client_id: client.id, order_code: "ORD-100" });

  const cancelled = await ordersService.cancelOrder(order.id, { reason: "Client changed their mind" });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.cancellation_reason, "Client changed their mind");

  await assert.rejects(
    () => ordersService.cancelOrder(order.id, { reason: "Again" }),
    (err: unknown) => {
      assert.ok(err instanceof CommercialDomainError);
      assert.equal(err.code, "ORDER_NOT_CANCELLABLE");
      return true;
    }
  );
});

test("CO11: creates an employee and rejects a duplicate employee_code", async () => {
  const employee = await organizationService.createEmployee({
    employee_code: "EMP-100",
    name: "Ravi Kumar",
    department: "Warehouse",
    depot_id: testDepotId
  });

  assert.equal(employee.employee_code, "EMP-100");
  assert.equal(employee.currentShift, null);

  await assert.rejects(
    () => organizationService.createEmployee({ employee_code: "EMP-100", name: "Someone Else" }),
    (err: unknown) => {
      assert.ok(err instanceof CommercialDomainError);
      assert.equal(err.code, "DUPLICATE_EMPLOYEE_CODE");
      return true;
    }
  );
});

test("CO12: assigns a shift to an employee and resolves it as currentShift", async () => {
  const employee = await organizationService.createEmployee({ employee_code: "EMP-100", name: "Ravi Kumar" });

  const updated = await organizationService.createShiftAssignment(employee.id, {
    shift_id: testShiftId,
    effective_from: new Date(Date.now() - 60_000)
  });

  assert.ok(updated.currentShift);
  assert.equal(updated.currentShift?.shift_id, testShiftId);
  assert.equal(updated.currentShift?.shift_name, "Morning Shift");
});
