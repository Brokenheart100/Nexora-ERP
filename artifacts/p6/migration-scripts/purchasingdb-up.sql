CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
        IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'purchasing') THEN
            CREATE SCHEMA purchasing;
        END IF;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE TABLE purchasing.orders (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Number" character varying(60) NOT NULL,
        "Currency" character varying(3) NOT NULL,
        "MinorUnits" integer NOT NULL,
        "On" date NOT NULL,
        "SupplierId" uuid NOT NULL,
        "SupplierCode" character varying(40) NOT NULL,
        "SupplierName" character varying(160) NOT NULL,
        "SupplierVersion" bigint NOT NULL,
        "Note" character varying(300) NOT NULL,
        "MakerIssuer" character varying(500) NOT NULL,
        "MakerSubject" character varying(200) NOT NULL,
        "ApproverIssuer" character varying(500),
        "ApproverSubject" character varying(200),
        "ApprovedVersion" bigint,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        "ApprovedAtUtc" timestamp with time zone,
        "State" integer NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_orders" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_orders_TenantId_WorkspaceId_Id" UNIQUE ("TenantId", "WorkspaceId", "Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE TABLE purchasing.order_audit (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "OrderId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "OperationId" uuid NOT NULL,
        "Action" character varying(40) NOT NULL,
        "Fingerprint" character varying(64) NOT NULL,
        "ResultVersion" bigint NOT NULL,
        "Reason" character varying(300),
        "OccurredAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_order_audit" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_order_audit_orders_TenantId_WorkspaceId_OrderId" FOREIGN KEY ("TenantId", "WorkspaceId", "OrderId") REFERENCES purchasing.orders ("TenantId", "WorkspaceId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE TABLE purchasing.order_lines (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "OrderId" uuid NOT NULL,
        "Ordinal" integer NOT NULL,
        "ItemId" uuid NOT NULL,
        "ItemCode" character varying(40) NOT NULL,
        "ItemName" character varying(160) NOT NULL,
        "ItemVersion" bigint NOT NULL,
        "CategoryId" uuid NOT NULL,
        "CategoryVersion" bigint NOT NULL,
        "UnitId" uuid NOT NULL,
        "UnitCode" character varying(40) NOT NULL,
        "UnitVersion" bigint NOT NULL,
        "Quantity" numeric(20,6) NOT NULL,
        "UnitPrice" numeric(20,6) NOT NULL,
        "Amount" numeric(20,6) NOT NULL,
        CONSTRAINT "PK_order_lines" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_order_lines_orders_TenantId_WorkspaceId_OrderId" FOREIGN KEY ("TenantId", "WorkspaceId", "OrderId") REFERENCES purchasing.orders ("TenantId", "WorkspaceId", "Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE UNIQUE INDEX "IX_order_audit_TenantId_WorkspaceId_Issuer_Subject_OperationId" ON purchasing.order_audit ("TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE INDEX "IX_order_audit_TenantId_WorkspaceId_OrderId" ON purchasing.order_audit ("TenantId", "WorkspaceId", "OrderId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE INDEX "IX_order_lines_TenantId_WorkspaceId_OrderId" ON purchasing.order_lines ("TenantId", "WorkspaceId", "OrderId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE INDEX "IX_orders_TenantId_WorkspaceId_CreatedAtUtc" ON purchasing.orders ("TenantId", "WorkspaceId", "CreatedAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE INDEX "IX_orders_TenantId_WorkspaceId_MakerIssuer_MakerSubject_Create~" ON purchasing.orders ("TenantId", "WorkspaceId", "MakerIssuer", "MakerSubject", "CreatedAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    CREATE UNIQUE INDEX "IX_orders_TenantId_WorkspaceId_Number" ON purchasing.orders ("TenantId", "WorkspaceId", "Number");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081309_InitialPurchasingOrders') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107081309_InitialPurchasingOrders', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040146_ReceiptPermitsAndProcesses') THEN
    ALTER TABLE purchasing.order_audit ADD "TargetId" uuid;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040146_ReceiptPermitsAndProcesses') THEN
    CREATE TABLE purchasing.receipt_permits (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "OrderId" uuid NOT NULL,
        "LineId" uuid NOT NULL,
        "WarehouseId" uuid NOT NULL,
        "Quantity" numeric(20,6) NOT NULL,
        "Executed" numeric(20,6) NOT NULL,
        "Revision" bigint NOT NULL,
        "Cancelling" boolean NOT NULL,
        "Fenced" boolean NOT NULL,
        CONSTRAINT "PK_receipt_permits" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_receipt_permits_orders_TenantId_WorkspaceId_OrderId" FOREIGN KEY ("TenantId", "WorkspaceId", "OrderId") REFERENCES purchasing.orders ("TenantId", "WorkspaceId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040146_ReceiptPermitsAndProcesses') THEN
    CREATE TABLE purchasing.receipt_processes (
        "Id" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "OrderId" uuid NOT NULL,
        "Version" integer NOT NULL,
        CONSTRAINT "PK_receipt_processes" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040146_ReceiptPermitsAndProcesses') THEN
    CREATE INDEX "IX_receipt_permits_TenantId_WorkspaceId_OrderId" ON purchasing.receipt_permits ("TenantId", "WorkspaceId", "OrderId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108040146_ReceiptPermitsAndProcesses') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108040146_ReceiptPermitsAndProcesses', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092927_OrderDepartment') THEN
    ALTER TABLE purchasing.orders ADD "DepartmentId" uuid;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092927_OrderDepartment') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261112092927_OrderDepartment', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045224_AddRecordChanges') THEN
    CREATE TABLE purchasing.record_changes (
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
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045224_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_EntityName_EntityId" ON purchasing.record_changes ("TenantId", "WorkspaceId", "EntityName", "EntityId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045224_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_OccurredAtUtc" ON purchasing.record_changes ("TenantId", "WorkspaceId", "OccurredAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045224_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_Operation" ON purchasing.record_changes ("TenantId", "WorkspaceId", "Operation");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045224_AddRecordChanges') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261114045224_AddRecordChanges', '10.0.14');
    END IF;
END $EF$;
COMMIT;

