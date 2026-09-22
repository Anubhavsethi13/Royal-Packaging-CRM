import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  DatabaseRBACAuthorizationPolicy
} from "../apps/api/src/middleware/auth-middleware.js";
import { RBACService } from "../apps/api/src/modules/identity/rbac-service.js";
import { QualityService } from "../apps/api/src/modules/quality/quality-service.js";
import { TaskService } from "../apps/api/src/modules/warehouse/task-service.js";
import type { ApiContext } from "../apps/api/src/router.js";
import { TaskDomainError } from "../packages/contracts/src/warehouse/index.js";
import type { DatabaseConnection } from "../packages/db/src/index.js";

interface MockRole {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

interface MockUserRole {
  id: string;
  user_id: string;
  role_id: string;
  assigned_at: Date;
  assigned_by_user_id: string;
  revoked_at: Date | null;
  revoked_by_user_id: string | null;
  version: string;
}

interface MockEmployee {
  id: string;
  user_id: string | null;
  is_active: boolean;
}

interface MockTaskAssignment {
  id: string;
  task_id: string;
  employee_id: string;
  assigned_at: Date;
  assigned_by_user_id: string;
  unassigned_at: Date | null;
  unassigned_by_user_id: string | null;
  version: string;
}

interface MockTask {
  id: string;
  status: string;
  depot_id: string | null;
  task_type: string | null;
  planned_box_quantity: string | null;
  completed_box_quantity: string | null;
  started_at: Date | null;
  paused_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockQualityRecord {
  id: string;
  task_id: string;
  outcome: string;
  quality_score: string | null;
  damage_rate: string | null;
  task_accuracy: string | null;
  final_inventory_status: string | null;
  inspected_at: Date;
  inspected_by_user_id: string | null;
  superseded_by_record_id: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockTaskPhoto {
  id: string;
  task_id: string;
  layer_number: number;
  box_quantity: string;
  captured_by_employee_id: string | null;
  captured_at: Date;
  storage_key: string;
  status: string | null;
  superseded_by_photo_id: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}

interface MockTaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  event_at: Date;
  actor_user_id: string | null;
  correlation_id: string | null;
  metadata: string | null;
  created_at: Date;
}

function createMockRBACDatabase() {
  const roles: MockRole[] = [
    { id: "r-super-admin", code: "SUPER_ADMIN", name: "Super Admin", active: true },
    { id: "r-main-admin", code: "MAIN_ADMIN", name: "Main Admin", active: true },
    { id: "r-admin", code: "ADMIN", name: "Admin", active: true },
    { id: "r-manager", code: "MANAGER", name: "Manager", active: true },
    { id: "r-employee", code: "EMPLOYEE", name: "Employee", active: true }
  ];
  const userRoles: MockUserRole[] = [];
  const employees: MockEmployee[] = [];
  const taskAssignments: MockTaskAssignment[] = [];
  const tasks: MockTask[] = [];
  const qualityRecords: MockQualityRecord[] = [];
  const taskPhotos: MockTaskPhoto[] = [];
  const taskEvents: MockTaskEvent[] = [];

  const createQueryBuilder = (selectedTable: string) => {
    const filters: Array<{ col: string; op: string; val: unknown }> = [];
    let orderByCol: string | null = null;
    let orderDir: "asc" | "desc" = "asc";

    const builder = {
      innerJoin: () => builder,
      select: () => builder,
      selectAll: () => builder,
      distinct: () => builder,
      forUpdate: () => builder,
      orderBy: (col: string, dir: "asc" | "desc" = "asc") => {
        orderByCol = col;
        orderDir = dir;
        return builder;
      },
      where: (col: string, op: string, val: unknown) => {
        filters.push({ col, op, val });
        return builder;
      },
      execute: async () => {
        if (selectedTable === "user_access_roles") {
          const results: Array<{ code: string }> = [];
          for (const ur of userRoles) {
            if (ur.revoked_at !== null) continue;
            const role = roles.find((r) => r.id === ur.role_id);
            if (!role || !role.active) continue;

            const matchUser = filters.some((f) => f.col === "user_access_roles.user_id" && f.val === ur.user_id);
            if (matchUser) {
              results.push({ code: role.code });
            }
          }
          return results;
        }

        if (selectedTable === "quality_records") {
          let list = [...qualityRecords];
          for (const f of filters) {
            if (f.col === "task_id" && f.op === "=") list = list.filter((r) => r.task_id === f.val);
            if (f.col === "superseded_by_record_id" && f.op === "is" && f.val === null) {
              list = list.filter((r) => r.superseded_by_record_id === null);
            }
          }
          if (orderByCol) {
            list.sort((a, b) => {
              const aVal = (a as unknown as Record<string, unknown>)[orderByCol!] as Date;
              const bVal = (b as unknown as Record<string, unknown>)[orderByCol!] as Date;
              return orderDir === "desc" ? bVal.getTime() - aVal.getTime() : aVal.getTime() - bVal.getTime();
            });
          }
          return list;
        }

        if (selectedTable === "task_assignments") {
          let list = [...taskAssignments];
          for (const f of filters) {
            if (f.col === "task_id" && f.op === "=") list = list.filter((a) => a.task_id === f.val);
            if (f.col === "employee_id" && f.op === "=") list = list.filter((a) => a.employee_id === f.val);
            if (f.col === "unassigned_at" && f.op === "is" && f.val === null) list = list.filter((a) => a.unassigned_at === null);
          }
          return list;
        }

        if (selectedTable === "tasks") {
          let list = [...tasks];
          for (const f of filters) {
            if (f.col === "id" && f.op === "=") list = list.filter((t) => t.id === f.val);
          }
          return list;
        }

        return [];
      },
      executeTakeFirst: async () => {
        if (selectedTable === "access_roles") {
          for (const f of filters) {
            if (f.col === "code" && f.op === "=") {
              return roles.find((r) => r.code === f.val);
            }
          }
        }
        if (selectedTable === "employees") {
          let list = [...employees];
          for (const f of filters) {
            if (f.col === "user_id" && f.op === "=") list = list.filter((e) => e.user_id === f.val);
            if (f.col === "id" && f.op === "=") list = list.filter((e) => e.id === f.val);
            if (f.col === "is_active" && f.op === "=") list = list.filter((e) => e.is_active === f.val);
          }
          return list[0];
        }
        if (selectedTable === "task_assignments") {
          let list = [...taskAssignments];
          for (const f of filters) {
            if (f.col === "task_id" && f.op === "=") list = list.filter((a) => a.task_id === f.val);
            if (f.col === "employee_id" && f.op === "=") list = list.filter((a) => a.employee_id === f.val);
            if (f.col === "unassigned_at" && f.op === "is" && f.val === null) list = list.filter((a) => a.unassigned_at === null);
          }
          return list[0];
        }
        if (selectedTable === "tasks") {
          for (const f of filters) {
            if (f.col === "id" && f.op === "=") {
              return tasks.find((t) => t.id === f.val);
            }
          }
        }
        if (selectedTable === "quality_records") {
          let list = [...qualityRecords];
          for (const f of filters) {
            if (f.col === "task_id" && f.op === "=") list = list.filter((r) => r.task_id === f.val);
            if (f.col === "superseded_by_record_id" && f.op === "is" && f.val === null) {
              list = list.filter((r) => r.superseded_by_record_id === null);
            }
          }
          if (orderByCol) {
            list.sort((a, b) => {
              const aVal = (a as unknown as Record<string, unknown>)[orderByCol!] as Date;
              const bVal = (b as unknown as Record<string, unknown>)[orderByCol!] as Date;
              return orderDir === "desc" ? bVal.getTime() - aVal.getTime() : aVal.getTime() - bVal.getTime();
            });
          }
          return list[0];
        }
        return undefined;
      },
      executeTakeFirstOrThrow: async () => {
        const res = await builder.executeTakeFirst();
        if (!res) throw new Error("Not found");
        return res;
      }
    };
    return builder;
  };

  const db = {
    roles,
    userRoles,
    employees,
    taskAssignments,
    tasks,
    qualityRecords,
    taskPhotos,
    taskEvents,
    selectFrom: (table: string) => createQueryBuilder(table),
    insertInto: (table: string) => ({
      values: (val: Record<string, unknown>) => ({
        execute: async () => {
          if (table === "user_access_roles") {
            userRoles.push(val as unknown as MockUserRole);
          } else if (table === "tasks") {
            tasks.push(val as unknown as MockTask);
          } else if (table === "task_assignments") {
            taskAssignments.push(val as unknown as MockTaskAssignment);
          } else if (table === "quality_records") {
            qualityRecords.push(val as unknown as MockQualityRecord);
          } else if (table === "task_events") {
            taskEvents.push(val as unknown as MockTaskEvent);
          }
          return {};
        }
      })
    }),
    updateTable: (table: string) => {
      let updateVals: Record<string, unknown> = {};
      const filters: Array<{ col: string; op: string; val: unknown }> = [];
      const updater = {
        set: (v: Record<string, unknown>) => {
          updateVals = v;
          return updater;
        },
        where: (col: string, op: string, val: unknown) => {
          filters.push({ col, op, val });
          return updater;
        },
        execute: async () => {
          if (table === "tasks") {
            for (const t of tasks) {
              const match = filters.every((f) => (t as unknown as Record<string, unknown>)[f.col] === f.val);
              if (match) {
                const nextVer = String(Number(t.version || 1) + 1);
                Object.assign(t, updateVals);
                t.version = nextVer;
              }
            }
          }
          if (table === "quality_records") {
            for (const q of qualityRecords) {
              const match = filters.every((f) => (q as unknown as Record<string, unknown>)[f.col] === f.val);
              if (match) {
                Object.assign(q, updateVals);
              }
            }
          }
          return {};
        }
      };
      return updater;
    },
    transaction: () => ({
      execute: async <T>(cb: (trx: unknown) => Promise<T>): Promise<T> => {
        return cb(db);
      }
    })
  };

  return db as unknown as DatabaseConnection & {
    roles: MockRole[];
    userRoles: MockUserRole[];
    employees: MockEmployee[];
    taskAssignments: MockTaskAssignment[];
    tasks: MockTask[];
    qualityRecords: MockQualityRecord[];
  };
}

function createMockContext(userId: string): ApiContext {
  return {
    req: {} as ApiContext["req"],
    res: {} as ApiContext["res"],
    method: "POST",
    path: "/tasks",
    url: new URL("http://localhost:3000/tasks"),
    params: {},
    query: new URLSearchParams(),
    cookies: {},
    correlationId: crypto.randomUUID(),
    idempotencyKey: null,
    body: {},
    sessionToken: "mock-session-token",
    user: {
      id: userId,
      login_identifier: "user_" + userId,
      is_active: true,
      created_at: new Date(),
      updated_at: new Date()
    }
  };
}

test("RBAC: Super Admin, Main Admin, Admin, and Manager can assign & unassign tasks, Employee cannot", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });
  const policy = new DatabaseRBACAuthorizationPolicy({ database: db, rbacService });

  const superAdminId = "user-super-admin";
  const mainAdminId = "user-main-admin";
  const adminId = "user-admin";
  const managerId = "user-manager";
  const employeeId = "user-employee";

  await rbacService.assignRoleToUser(superAdminId, "SUPER_ADMIN", "system");
  await rbacService.assignRoleToUser(mainAdminId, "MAIN_ADMIN", "system");
  await rbacService.assignRoleToUser(adminId, "ADMIN", "system");
  await rbacService.assignRoleToUser(managerId, "MANAGER", "system");
  await rbacService.assignRoleToUser(employeeId, "EMPLOYEE", "system");

  for (const action of ["task:assign", "task:unassign"]) {
    assert.equal(await policy.evaluate(createMockContext(superAdminId), action), true);
    assert.equal(await policy.evaluate(createMockContext(mainAdminId), action), true);
    assert.equal(await policy.evaluate(createMockContext(adminId), action), true);
    assert.equal(await policy.evaluate(createMockContext(managerId), action), true);
    assert.equal(await policy.evaluate(createMockContext(employeeId), action), false);
  }
});

test("RBAC: Super Admin, Main Admin, Admin, and Manager can cancel tasks, Employee cannot", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });
  const policy = new DatabaseRBACAuthorizationPolicy({ database: db, rbacService });

  const superAdminId = "u-super";
  const mainAdminId = "u-main";
  const adminId = "u-admin";
  const managerId = "u-mgr";
  const employeeId = "u-emp";

  await rbacService.assignRoleToUser(superAdminId, "SUPER_ADMIN", "system");
  await rbacService.assignRoleToUser(mainAdminId, "MAIN_ADMIN", "system");
  await rbacService.assignRoleToUser(adminId, "ADMIN", "system");
  await rbacService.assignRoleToUser(managerId, "MANAGER", "system");
  await rbacService.assignRoleToUser(employeeId, "EMPLOYEE", "system");

  assert.equal(await policy.evaluate(createMockContext(superAdminId), "task:cancel"), true);
  assert.equal(await policy.evaluate(createMockContext(mainAdminId), "task:cancel"), true);
  assert.equal(await policy.evaluate(createMockContext(adminId), "task:cancel"), true);
  assert.equal(await policy.evaluate(createMockContext(managerId), "task:cancel"), true);
  assert.equal(await policy.evaluate(createMockContext(employeeId), "task:cancel"), false);
});

test("RBAC: Super Admin, Main Admin, and Admin can reopen tasks; Manager and Employee CANNOT reopen", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });
  const policy = new DatabaseRBACAuthorizationPolicy({ database: db, rbacService });

  const superAdminId = "u-super";
  const mainAdminId = "u-main";
  const adminId = "u-admin";
  const managerId = "u-mgr";
  const employeeId = "u-emp";

  await rbacService.assignRoleToUser(superAdminId, "SUPER_ADMIN", "system");
  await rbacService.assignRoleToUser(mainAdminId, "MAIN_ADMIN", "system");
  await rbacService.assignRoleToUser(adminId, "ADMIN", "system");
  await rbacService.assignRoleToUser(managerId, "MANAGER", "system");
  await rbacService.assignRoleToUser(employeeId, "EMPLOYEE", "system");

  assert.equal(await policy.evaluate(createMockContext(superAdminId), "task:reopen"), true);
  assert.equal(await policy.evaluate(createMockContext(mainAdminId), "task:reopen"), true);
  assert.equal(await policy.evaluate(createMockContext(adminId), "task:reopen"), true);
  assert.equal(await policy.evaluate(createMockContext(managerId), "task:reopen"), false);
  assert.equal(await policy.evaluate(createMockContext(employeeId), "task:reopen"), false);
});

test("RBAC: Super Admin ALONE can approve incentive / payroll / financial actions", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });
  const policy = new DatabaseRBACAuthorizationPolicy({ database: db, rbacService });

  const superAdminId = "u-super";
  const mainAdminId = "u-main";
  const adminId = "u-admin";
  const managerId = "u-mgr";
  const employeeId = "u-emp";

  await rbacService.assignRoleToUser(superAdminId, "SUPER_ADMIN", "system");
  await rbacService.assignRoleToUser(mainAdminId, "MAIN_ADMIN", "system");
  await rbacService.assignRoleToUser(adminId, "ADMIN", "system");
  await rbacService.assignRoleToUser(managerId, "MANAGER", "system");
  await rbacService.assignRoleToUser(employeeId, "EMPLOYEE", "system");

  for (const action of ["incentive:approve", "payroll:approve", "financial:approve"]) {
    assert.equal(await policy.evaluate(createMockContext(superAdminId), action), true);
    assert.equal(await policy.evaluate(createMockContext(mainAdminId), action), false);
    assert.equal(await policy.evaluate(createMockContext(adminId), action), false);
    assert.equal(await policy.evaluate(createMockContext(managerId), action), false);
    assert.equal(await policy.evaluate(createMockContext(employeeId), action), false);
  }
});

test("RBAC: Quality inspection permitted for Super Admin, Main Admin, Admin, Manager; Employee blocked", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });
  const policy = new DatabaseRBACAuthorizationPolicy({ database: db, rbacService });

  const superAdminId = "u-super";
  const mainAdminId = "u-main";
  const adminId = "u-admin";
  const managerId = "u-mgr";
  const employeeId = "u-emp";

  await rbacService.assignRoleToUser(superAdminId, "SUPER_ADMIN", "system");
  await rbacService.assignRoleToUser(mainAdminId, "MAIN_ADMIN", "system");
  await rbacService.assignRoleToUser(adminId, "ADMIN", "system");
  await rbacService.assignRoleToUser(managerId, "MANAGER", "system");
  await rbacService.assignRoleToUser(employeeId, "EMPLOYEE", "system");

  assert.equal(await policy.evaluate(createMockContext(superAdminId), "quality:inspect"), true);
  assert.equal(await policy.evaluate(createMockContext(mainAdminId), "quality:inspect"), true);
  assert.equal(await policy.evaluate(createMockContext(adminId), "quality:inspect"), true);
  assert.equal(await policy.evaluate(createMockContext(managerId), "quality:inspect"), true);
  assert.equal(await policy.evaluate(createMockContext(employeeId), "quality:inspect"), false);
});

test("Task Pause / Resume: Employee can pause/resume own task, cannot pause another's task; Manager overrides", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });
  const policy = new DatabaseRBACAuthorizationPolicy({ database: db, rbacService });

  const empUserId1 = "user-emp-1";
  const empUserId2 = "user-emp-2";
  const mgrUserId = "user-mgr";

  await rbacService.assignRoleToUser(empUserId1, "EMPLOYEE", "system");
  await rbacService.assignRoleToUser(empUserId2, "EMPLOYEE", "system");
  await rbacService.assignRoleToUser(mgrUserId, "MANAGER", "system");

  const empId1 = "emp-rec-1";
  const empId2 = "emp-rec-2";
  db.employees.push(
    { id: empId1, user_id: empUserId1, is_active: true },
    { id: empId2, user_id: empUserId2, is_active: true }
  );

  const task1Id = "task-1";
  const task2Id = "task-2";

  // Assign task1 to emp1
  db.taskAssignments.push({
    id: "assign-1",
    task_id: task1Id,
    employee_id: empId1,
    assigned_at: new Date(),
    assigned_by_user_id: "system",
    unassigned_at: null,
    unassigned_by_user_id: null,
    version: "1"
  });

  // Assign task2 to emp2
  db.taskAssignments.push({
    id: "assign-2",
    task_id: task2Id,
    employee_id: empId2,
    assigned_at: new Date(),
    assigned_by_user_id: "system",
    unassigned_at: null,
    unassigned_by_user_id: null,
    version: "1"
  });

  // 1. Employee 1 on own task (task 1) -> Allowed
  assert.equal(await policy.evaluate(createMockContext(empUserId1), "task:pause", task1Id), true);
  assert.equal(await policy.evaluate(createMockContext(empUserId1), "task:resume", task1Id), true);

  // 2. Employee 1 on another's task (task 2) -> Blocked
  assert.equal(await policy.evaluate(createMockContext(empUserId1), "task:pause", task2Id), false);
  assert.equal(await policy.evaluate(createMockContext(empUserId1), "task:resume", task2Id), false);

  // 3. Employee 2 on own task (task 2) -> Allowed
  assert.equal(await policy.evaluate(createMockContext(empUserId2), "task:pause", task2Id), true);
  assert.equal(await policy.evaluate(createMockContext(empUserId2), "task:resume", task2Id), true);

  // 4. Employee 2 on task 1 -> Blocked
  assert.equal(await policy.evaluate(createMockContext(empUserId2), "task:pause", task1Id), false);
  assert.equal(await policy.evaluate(createMockContext(empUserId2), "task:resume", task1Id), false);

  // 5. Manager override on any task -> Allowed
  assert.equal(await policy.evaluate(createMockContext(mgrUserId), "task:pause", task1Id), true);
  assert.equal(await policy.evaluate(createMockContext(mgrUserId), "task:pause", task2Id), true);
  assert.equal(await policy.evaluate(createMockContext(mgrUserId), "task:resume", task1Id), true);
  assert.equal(await policy.evaluate(createMockContext(mgrUserId), "task:resume", task2Id), true);

  // 6. Admin, Main Admin, Super Admin cannot automatically override another employee's task
  const adminUserId = "user-admin";
  const mainAdminUserId = "user-main-admin";
  const superAdminUserId = "user-super-admin";

  await rbacService.assignRoleToUser(adminUserId, "ADMIN", "system");
  await rbacService.assignRoleToUser(mainAdminUserId, "MAIN_ADMIN", "system");
  await rbacService.assignRoleToUser(superAdminUserId, "SUPER_ADMIN", "system");

  // Not assigned to task1 or task2 -> Blocked from pause/resume
  assert.equal(await policy.evaluate(createMockContext(adminUserId), "task:pause", task1Id), false);
  assert.equal(await policy.evaluate(createMockContext(adminUserId), "task:resume", task1Id), false);
  assert.equal(await policy.evaluate(createMockContext(mainAdminUserId), "task:pause", task1Id), false);
  assert.equal(await policy.evaluate(createMockContext(mainAdminUserId), "task:resume", task1Id), false);
  assert.equal(await policy.evaluate(createMockContext(superAdminUserId), "task:pause", task1Id), false);
  assert.equal(await policy.evaluate(createMockContext(superAdminUserId), "task:resume", task1Id), false);

  // If Admin has an employee assignment on task1 -> Allowed on own task
  const adminEmpId = "emp-admin";
  db.employees.push({ id: adminEmpId, user_id: adminUserId, is_active: true });
  db.taskAssignments.push({
    id: "assign-admin",
    task_id: task1Id,
    employee_id: adminEmpId,
    assigned_at: new Date(),
    assigned_by_user_id: "system",
    unassigned_at: null,
    unassigned_by_user_id: null,
    version: "1"
  });
  assert.equal(await policy.evaluate(createMockContext(adminUserId), "task:pause", task1Id), true);
  assert.equal(await policy.evaluate(createMockContext(adminUserId), "task:resume", task1Id), true);
  assert.equal(await policy.evaluate(createMockContext(adminUserId), "task:pause", task2Id), false);
});

test("RBAC: Wildcard permissions (task:*, inventory:*, quality:*, financial:*, *) fail closed for all roles", async () => {
  const db = createMockRBACDatabase();
  const rbacService = new RBACService({ database: db });
  const policy = new DatabaseRBACAuthorizationPolicy({ database: db, rbacService });

  const superAdminId = "u-super";
  const mainAdminId = "u-main";
  const adminId = "u-admin";
  const managerId = "u-mgr";
  const employeeId = "u-emp";

  await rbacService.assignRoleToUser(superAdminId, "SUPER_ADMIN", "system");
  await rbacService.assignRoleToUser(mainAdminId, "MAIN_ADMIN", "system");
  await rbacService.assignRoleToUser(adminId, "ADMIN", "system");
  await rbacService.assignRoleToUser(managerId, "MANAGER", "system");
  await rbacService.assignRoleToUser(employeeId, "EMPLOYEE", "system");

  const wildcardActions = [
    "*",
    "task:*",
    "inventory:*",
    "quality:*",
    "financial:*",
    "admin:*",
    "user:*",
    "unspecified:action"
  ];

  for (const action of wildcardActions) {
    assert.equal(await policy.evaluate(createMockContext(superAdminId), action), false);
    assert.equal(await policy.evaluate(createMockContext(mainAdminId), action), false);
    assert.equal(await policy.evaluate(createMockContext(adminId), action), false);
    assert.equal(await policy.evaluate(createMockContext(managerId), action), false);
    assert.equal(await policy.evaluate(createMockContext(employeeId), action), false);
  }
});

test("Quality Gate: damage_rate >= 5% fails quality and blocks task completion until passing reinspection", async () => {
  const db = createMockRBACDatabase();
  const qualityService = new QualityService({ database: db });
  const taskService = new TaskService({ database: db });

  const taskId = crypto.randomUUID();
  const actorUserId = crypto.randomUUID();

  db.tasks.push({
    id: taskId,
    status: "IN_PROGRESS",
    depot_id: null,
    task_type: "REPACK",
    planned_box_quantity: "100",
    completed_box_quantity: null,
    started_at: new Date(),
    paused_at: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    version: "1"
  });

  // 1. Quality inspection fails with damage_rate = 6% (>= 5%)
  const failedInspection = await qualityService.inspectTask(
    {
      task_id: taskId,
      outcome: "PASS", // Client attempted PASS but damage >= 5% forces FAIL / DAMAGED
      damage_rate: 6.0
    },
    actorUserId
  );

  assert.equal(failedInspection.outcome, "FAIL");
  assert.equal(failedInspection.final_inventory_status, "DAMAGED");

  // 2. Task completion must be blocked due to failed quality gate
  await assert.rejects(
    async () => {
      await taskService.completeTask(
        { task_id: taskId, completed_box_quantity: 100n },
        actorUserId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskDomainError);
      assert.equal(err.code, "QUALITY_GATE_FAILED");
      return true;
    }
  );

  // 3. Passing reinspection supersedes failed inspection
  const passingInspection = await qualityService.inspectTask(
    {
      task_id: taskId,
      outcome: "PASS",
      damage_rate: 1.0,
      supersedes_record_id: failedInspection.id
    },
    actorUserId
  );

  assert.equal(passingInspection.outcome, "PASS");
  assert.equal(passingInspection.final_inventory_status, "AVAILABLE");

  // 4. Task completion now succeeds
  const completedTask = await taskService.completeTask(
    { task_id: taskId, completed_box_quantity: 100n },
    actorUserId
  );

  assert.equal(completedTask.status, "COMPLETED");
  assert.equal(completedTask.completed_box_quantity, 100n);
});

test("Task Cancellation: Started / In-Progress tasks cannot be cancelled (only unstarted PENDING/ASSIGNED tasks)", async () => {
  const db = createMockRBACDatabase();
  const taskService = new TaskService({ database: db });
  const actorUserId = crypto.randomUUID();

  const startedTaskId = crypto.randomUUID();
  db.tasks.push({
    id: startedTaskId,
    status: "IN_PROGRESS",
    depot_id: null,
    task_type: "REPACK",
    planned_box_quantity: "50",
    completed_box_quantity: null,
    started_at: new Date(),
    paused_at: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    version: "1"
  });

  // Attempt to cancel IN_PROGRESS task is rejected
  await assert.rejects(
    async () => {
      await taskService.cancelTask(
        { task_id: startedTaskId, reason: "Attempt cancel started task" },
        actorUserId
      );
    },
    (err: unknown) => {
      assert.ok(err instanceof TaskDomainError);
      assert.equal(err.code, "INVALID_TASK_STATE");
      return true;
    }
  );

  // Unstarted PENDING task can be cancelled
  const pendingTaskId = crypto.randomUUID();
  db.tasks.push({
    id: pendingTaskId,
    status: "PENDING",
    depot_id: null,
    task_type: "REPACK",
    planned_box_quantity: "50",
    completed_box_quantity: null,
    started_at: null,
    paused_at: null,
    completed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
    version: "1"
  });

  const cancelled = await taskService.cancelTask(
    { task_id: pendingTaskId, reason: "Order cancelled before start" },
    actorUserId
  );
  assert.equal(cancelled.status, "CANCELLED");
});
