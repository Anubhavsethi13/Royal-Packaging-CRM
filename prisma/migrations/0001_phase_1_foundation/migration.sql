-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('admin', 'loader', 'operator', 'picker', 'supervisor');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('draft', 'confirmed', 'in_production', 'ready', 'dispatched', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('available', 'damaged', 'in_transit', 'reserved', 'staged');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('load', 'putaway', 'stage', 'transfer', 'unload');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('queued', 'in_progress', 'completed');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('loading', 'packing', 'putaway', 'staging', 'unloading', 'wrapping');

-- CreateEnum
CREATE TYPE "IncentiveRuleType" AS ENUM ('quality', 'speed', 'spot_reward', 'volume');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('pending', 'approved', 'paid');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPassword" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPassword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "success" BOOLEAN NOT NULL,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL,
    "shiftName" TEXT,
    "hourlyRate" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "accountCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "materialSpecs" JSONB,
    "openOrders" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "materialName" TEXT NOT NULL,
    "materialSpecs" JSONB,
    "quantity" DECIMAL(14,3),
    "unit" TEXT,
    "weightKg" DECIMAL(14,3),
    "volumeM3" DECIMAL(14,3),
    "status" "OrderStatus" NOT NULL DEFAULT 'draft',
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "requestedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "clientId" TEXT,
    "locationCode" TEXT,
    "materialName" TEXT NOT NULL,
    "materialType" TEXT,
    "quantity" DECIMAL(14,3),
    "sku" TEXT,
    "status" "InventoryStatus" NOT NULL DEFAULT 'available',
    "unit" TEXT,
    "volumeM3" DECIMAL(14,3),
    "weightKg" DECIMAL(14,3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "taskId" TEXT,
    "employeeId" TEXT,
    "movementType" "MovementType" NOT NULL,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "quantity" DECIMAL(14,3),
    "weightKg" DECIMAL(14,3),
    "volumeM3" DECIMAL(14,3),
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "taskType" "TaskType" NOT NULL,
    "inventoryItemId" TEXT,
    "clientId" TEXT,
    "referenceCode" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'queued',
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "weightKg" DECIMAL(14,3),
    "volumeM3" DECIMAL(14,3),
    "qualityScore" DECIMAL(5,2),
    "damageRate" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PalletAsset" (
    "id" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "locationCode" TEXT,
    "reusable" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PalletAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DockSchedule" (
    "id" TEXT NOT NULL,
    "dockCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "vehicleNumber" TEXT,
    "materialSummary" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT,
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DockSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ruleType" "IncentiveRuleType" NOT NULL,
    "threshold" DECIMAL(14,3),
    "payout" DECIMAL(14,2),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IncentiveRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "taskId" TEXT,
    "ruleId" TEXT,
    "points" DECIMAL(14,3),
    "cashAmount" DECIMAL(14,2),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentiveEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLedger" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "incentiveEventId" TEXT,
    "taskId" TEXT,
    "amount" DECIMAL(14,2),
    "points" DECIMAL(14,3),
    "status" "PayrollStatus" NOT NULL DEFAULT 'pending',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "AccessRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessPermission" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "AccessPermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessRolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "AccessRolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserAccessRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserAccessRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "AccessAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserPassword_userId_key" ON "UserPassword"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_attemptedAt_idx" ON "LoginAttempt"("email", "attemptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_accountCode_key" ON "Client"("accountCode");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderCode_key" ON "Order"("orderCode");

-- CreateIndex
CREATE INDEX "Order_clientId_status_idx" ON "Order"("clientId", "status");

-- CreateIndex
CREATE INDEX "Order_dueAt_priority_idx" ON "Order"("dueAt", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_barcode_key" ON "InventoryItem"("barcode");

-- CreateIndex
CREATE INDEX "InventoryItem_locationCode_status_idx" ON "InventoryItem"("locationCode", "status");

-- CreateIndex
CREATE INDEX "InventoryMovement_inventoryItemId_scannedAt_idx" ON "InventoryMovement"("inventoryItemId", "scannedAt");

-- CreateIndex
CREATE INDEX "InventoryMovement_taskId_idx" ON "InventoryMovement"("taskId");

-- CreateIndex
CREATE INDEX "Task_status_taskType_idx" ON "Task"("status", "taskType");

-- CreateIndex
CREATE INDEX "Task_employeeId_createdAt_idx" ON "Task"("employeeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PalletAsset_assetCode_key" ON "PalletAsset"("assetCode");

-- CreateIndex
CREATE INDEX "PalletAsset_locationCode_status_idx" ON "PalletAsset"("locationCode", "status");

-- CreateIndex
CREATE INDEX "DockSchedule_dockCode_scheduledAt_idx" ON "DockSchedule"("dockCode", "scheduledAt");

-- CreateIndex
CREATE INDEX "IncentiveEvent_employeeId_createdAt_idx" ON "IncentiveEvent"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "PayrollLedger_employeeId_periodStart_periodEnd_idx" ON "PayrollLedger"("employeeId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollLedger_status_periodStart_idx" ON "PayrollLedger"("status", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "AccessRole_name_key" ON "AccessRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "AccessPermission_name_key" ON "AccessPermission"("name");

-- CreateIndex
CREATE INDEX "AccessAuditLog_userId_createdAt_idx" ON "AccessAuditLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessAuditLog_resource_resourceId_idx" ON "AccessAuditLog"("resource", "resourceId");

-- AddForeignKey
ALTER TABLE "UserPassword" ADD CONSTRAINT "UserPassword_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DockSchedule" ADD CONSTRAINT "DockSchedule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveEvent" ADD CONSTRAINT "IncentiveEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveEvent" ADD CONSTRAINT "IncentiveEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveEvent" ADD CONSTRAINT "IncentiveEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "IncentiveRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLedger" ADD CONSTRAINT "PayrollLedger_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLedger" ADD CONSTRAINT "PayrollLedger_incentiveEventId_fkey" FOREIGN KEY ("incentiveEventId") REFERENCES "IncentiveEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLedger" ADD CONSTRAINT "PayrollLedger_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRolePermission" ADD CONSTRAINT "AccessRolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessRolePermission" ADD CONSTRAINT "AccessRolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "AccessPermission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessRole" ADD CONSTRAINT "UserAccessRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAccessRole" ADD CONSTRAINT "UserAccessRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AccessRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessAuditLog" ADD CONSTRAINT "AccessAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

