CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
        IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'masterdata') THEN
            CREATE SCHEMA masterdata;
        END IF;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    CREATE TABLE masterdata.definitions (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Kind" integer NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        CONSTRAINT "PK_definitions" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_definitions_TenantId_WorkspaceId_Id" UNIQUE ("TenantId", "WorkspaceId", "Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    CREATE TABLE masterdata.mutation_audit (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "OperationId" uuid NOT NULL,
        "Action" character varying(80) NOT NULL,
        "Fingerprint" character varying(64) NOT NULL,
        "ResourceId" uuid NOT NULL,
        "ResourceVersion" bigint NOT NULL,
        "OccurredAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_mutation_audit" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    CREATE TABLE masterdata.items (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        "Kind" integer NOT NULL,
        "TracksInventory" boolean NOT NULL,
        "CategoryId" uuid NOT NULL,
        "UnitId" uuid NOT NULL,
        "IsActive" boolean NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_items" PRIMARY KEY ("Id"),
        CONSTRAINT ck_items_kind_inventory CHECK (("Kind" = 1) OR ("Kind" = 2 AND NOT "TracksInventory")),
        CONSTRAINT "FK_items_definitions_TenantId_WorkspaceId_CategoryId" FOREIGN KEY ("TenantId", "WorkspaceId", "CategoryId") REFERENCES masterdata.definitions ("TenantId", "WorkspaceId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_items_definitions_TenantId_WorkspaceId_UnitId" FOREIGN KEY ("TenantId", "WorkspaceId", "UnitId") REFERENCES masterdata.definitions ("TenantId", "WorkspaceId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    CREATE UNIQUE INDEX "IX_definitions_TenantId_WorkspaceId_Kind_Code" ON masterdata.definitions ("TenantId", "WorkspaceId", "Kind", "Code");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    CREATE INDEX "IX_items_TenantId_WorkspaceId_CategoryId" ON masterdata.items ("TenantId", "WorkspaceId", "CategoryId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    CREATE UNIQUE INDEX "IX_items_TenantId_WorkspaceId_Code" ON masterdata.items ("TenantId", "WorkspaceId", "Code");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    CREATE INDEX "IX_items_TenantId_WorkspaceId_UnitId" ON masterdata.items ("TenantId", "WorkspaceId", "UnitId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    CREATE UNIQUE INDEX "IX_mutation_audit_TenantId_WorkspaceId_Issuer_Subject_Operatio~" ON masterdata.mutation_audit ("TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107050307_InitialCatalog') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107050307_InitialCatalog', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107052040_BusinessPartners') THEN
    CREATE TABLE masterdata.partners (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        "TaxNumber" character varying(64),
        "Address" character varying(300),
        "Roles" integer NOT NULL,
        "IsActive" boolean NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_partners" PRIMARY KEY ("Id"),
        CONSTRAINT ck_partners_roles CHECK ("Roles" BETWEEN 1 AND 7)
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107052040_BusinessPartners') THEN
    CREATE TABLE masterdata.partner_contacts (
        "Id" uuid NOT NULL,
        "PartnerId" uuid NOT NULL,
        "Name" character varying(160) NOT NULL,
        "Email" character varying(254),
        "Phone" character varying(40),
        CONSTRAINT "PK_partner_contacts" PRIMARY KEY ("PartnerId", "Id"),
        CONSTRAINT "FK_partner_contacts_partners_PartnerId" FOREIGN KEY ("PartnerId") REFERENCES masterdata.partners ("Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107052040_BusinessPartners') THEN
    CREATE UNIQUE INDEX "IX_partners_TenantId_WorkspaceId_Code" ON masterdata.partners ("TenantId", "WorkspaceId", "Code");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107052040_BusinessPartners') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107052040_BusinessPartners', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107055420_CatalogDefinitionLifecycle') THEN
    ALTER TABLE masterdata.definitions ADD "IsActive" boolean NOT NULL DEFAULT TRUE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107055420_CatalogDefinitionLifecycle') THEN
    ALTER TABLE masterdata.definitions ADD "Version" bigint NOT NULL DEFAULT 1;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107055420_CatalogDefinitionLifecycle') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107055420_CatalogDefinitionLifecycle', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045215_AddRecordChanges') THEN
    CREATE TABLE masterdata.record_changes (
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
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045215_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_EntityName_EntityId" ON masterdata.record_changes ("TenantId", "WorkspaceId", "EntityName", "EntityId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045215_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_OccurredAtUtc" ON masterdata.record_changes ("TenantId", "WorkspaceId", "OccurredAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045215_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_Operation" ON masterdata.record_changes ("TenantId", "WorkspaceId", "Operation");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045215_AddRecordChanges') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261114045215_AddRecordChanges', '10.0.14');
    END IF;
END $EF$;
COMMIT;

