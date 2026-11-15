CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
        IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'inventory') THEN
            CREATE SCHEMA inventory;
        END IF;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE TABLE inventory.cost_pools (
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "WarehouseId" uuid NOT NULL,
        "ItemId" uuid NOT NULL,
        "UnitId" uuid NOT NULL,
        "Currency" character varying(3) NOT NULL,
        "Sequence" bigint NOT NULL,
        "Quantity" numeric(20,6) NOT NULL,
        "Value" numeric(28,6) NOT NULL,
        CONSTRAINT "PK_cost_pools" PRIMARY KEY ("TenantId", "WorkspaceId", "WarehouseId", "ItemId")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE TABLE inventory.operation_audit (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "OperationId" uuid NOT NULL,
        "Fingerprint" character varying(64) NOT NULL,
        "TargetId" uuid NOT NULL,
        "ResultVersion" bigint NOT NULL,
        "OccurredAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_operation_audit" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE TABLE inventory.receipt_executions (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Terms" jsonb NOT NULL,
        "Revision" bigint NOT NULL,
        "Executed" numeric(20,6) NOT NULL,
        "Cost" numeric(28,6) NOT NULL,
        "Fenced" boolean NOT NULL,
        CONSTRAINT "PK_receipt_executions" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE TABLE inventory.stock_movements (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "WarehouseId" uuid NOT NULL,
        "ItemId" uuid NOT NULL,
        "PermitId" uuid NOT NULL,
        "Sequence" bigint NOT NULL,
        "On" date NOT NULL,
        "Quantity" numeric(20,6) NOT NULL,
        "Cost" numeric(28,6) NOT NULL,
        "OccurredAtUtc" timestamp with time zone NOT NULL,
        "ReversesId" uuid,
        CONSTRAINT "PK_stock_movements" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE TABLE inventory.warehouses (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        "ReceiverId" uuid,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_warehouses" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE UNIQUE INDEX "IX_operation_audit_TenantId_WorkspaceId_Issuer_Subject_Operati~" ON inventory.operation_audit ("TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE INDEX "IX_receipt_executions_TenantId_WorkspaceId" ON inventory.receipt_executions ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE UNIQUE INDEX "IX_stock_movements_TenantId_WorkspaceId_WarehouseId_ItemId_Seq~" ON inventory.stock_movements ("TenantId", "WorkspaceId", "WarehouseId", "ItemId", "Sequence");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    CREATE UNIQUE INDEX "IX_warehouses_TenantId_WorkspaceId_Code" ON inventory.warehouses ("TenantId", "WorkspaceId", "Code");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040145_InventoryReceiptLedger') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108040145_InventoryReceiptLedger', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_StockReturnsAndCostAdjustments') THEN
    ALTER TABLE inventory.stock_movements ADD "Reason" character varying(300);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_StockReturnsAndCostAdjustments') THEN
    CREATE TABLE inventory.stock_returns (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "WarehouseId" uuid NOT NULL,
        "OriginalId" uuid NOT NULL,
        "ApproverId" uuid NOT NULL,
        "On" date NOT NULL,
        "Quantity" numeric(20,6) NOT NULL,
        "Reason" character varying(300) NOT NULL,
        "MovementId" uuid,
        "Cancelled" boolean NOT NULL,
        CONSTRAINT "PK_stock_returns" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_StockReturnsAndCostAdjustments') THEN
    CREATE INDEX "IX_stock_returns_TenantId_WorkspaceId_OriginalId" ON inventory.stock_returns ("TenantId", "WorkspaceId", "OriginalId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_StockReturnsAndCostAdjustments') THEN
    CREATE INDEX "IX_stock_returns_TenantId_WorkspaceId_WarehouseId" ON inventory.stock_returns ("TenantId", "WorkspaceId", "WarehouseId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_StockReturnsAndCostAdjustments') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108042027_StockReturnsAndCostAdjustments', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108051214_SalesReservations') THEN
    ALTER TABLE inventory.stock_returns ADD "IsSales" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108051214_SalesReservations') THEN
    ALTER TABLE inventory.cost_pools ADD "Reserved" numeric(20,6) NOT NULL DEFAULT 0.0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108051214_SalesReservations') THEN
    CREATE TABLE inventory.sales_reservations (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "WarehouseId" uuid NOT NULL,
        "Terms" jsonb NOT NULL,
        "Executed" numeric(20,6) NOT NULL,
        "Revision" bigint NOT NULL,
        "Fenced" boolean NOT NULL,
        CONSTRAINT "PK_sales_reservations" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108051214_SalesReservations') THEN
    CREATE INDEX "IX_sales_reservations_TenantId_WorkspaceId_WarehouseId" ON inventory.sales_reservations ("TenantId", "WorkspaceId", "WarehouseId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108051214_SalesReservations') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108051214_SalesReservations', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108085620_InventoryStockOperations') THEN
    CREATE TABLE inventory.stock_operations (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "WarehouseId" uuid NOT NULL,
        "ItemId" uuid NOT NULL,
        "DestinationId" uuid,
        "MakerId" uuid NOT NULL,
        "ReviewerId" uuid,
        "On" date NOT NULL,
        "Quantity" numeric(20,6) NOT NULL,
        "Reason" character varying(300) NOT NULL,
        "ExpectedSequence" bigint NOT NULL,
        "BookQuantity" numeric(20,6) NOT NULL,
        "MovementId" uuid,
        "DestinationMovementId" uuid,
        "Cancelled" boolean NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_stock_operations" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108085620_InventoryStockOperations') THEN
    CREATE INDEX "IX_stock_operations_TenantId_WorkspaceId_DestinationId" ON inventory.stock_operations ("TenantId", "WorkspaceId", "DestinationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108085620_InventoryStockOperations') THEN
    CREATE INDEX "IX_stock_operations_TenantId_WorkspaceId_WarehouseId" ON inventory.stock_operations ("TenantId", "WorkspaceId", "WarehouseId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108085620_InventoryStockOperations') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108085620_InventoryStockOperations', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108090955_InventoryTransferTransit') THEN
    ALTER TABLE inventory.stock_operations ADD "ReceivedOn" date;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108090955_InventoryTransferTransit') THEN
    ALTER TABLE inventory.stock_operations ADD "TransitCost" numeric(20,6);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108090955_InventoryTransferTransit') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108090955_InventoryTransferTransit', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045228_AddRecordChanges') THEN
    CREATE TABLE inventory.record_changes (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Service" character varying(64) NOT NULL,
        "EntityName" character varying(256) NOT NULL,
        "EntityId" character varying(256) NOT NULL,
        "Operation" character varying(16) NOT NULL,
        "ActorIssuer" character varying(256) NOT NULL,
        "ActorSubject" character varying(256) NOT NULL,
        "OccurredAtUtc" timestamp with time zone NOT NULL,
        "ChangedProperties" character varying(4000),
        "BeforeJson" text,
        "AfterJson" text,
        CONSTRAINT "PK_record_changes" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045228_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_EntityName_EntityId" ON inventory.record_changes ("TenantId", "WorkspaceId", "EntityName", "EntityId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045228_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_OccurredAtUtc" ON inventory.record_changes ("TenantId", "WorkspaceId", "OccurredAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045228_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_Operation" ON inventory.record_changes ("TenantId", "WorkspaceId", "Operation");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045228_AddRecordChanges') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261114045228_AddRecordChanges', '10.0.14');
    END IF;
END $EF$;
COMMIT;

