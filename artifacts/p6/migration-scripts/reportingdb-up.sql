CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033849_InitialProjection') THEN
        IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'reporting') THEN
            CREATE SCHEMA reporting;
        END IF;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033849_InitialProjection') THEN
    CREATE TABLE reporting.workspace_projection (
        "WorkspaceId" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "Name" character varying(160) NOT NULL,
        "CountryCode" character varying(2) NOT NULL,
        "BaseCurrency" character varying(3) NOT NULL,
        "Version" bigint NOT NULL,
        "LastEventId" uuid NOT NULL,
        "ProjectedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_workspace_projection" PRIMARY KEY ("WorkspaceId")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033849_InitialProjection') THEN
    CREATE UNIQUE INDEX "IX_workspace_projection_LastEventId" ON reporting.workspace_projection ("LastEventId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033849_InitialProjection') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261106033849_InitialProjection', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044037_AuthorizationWatermarks') THEN
    CREATE TABLE reporting.workspace_authorization_watermarks (
        "WorkspaceId" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "Version" bigint NOT NULL,
        "LastEventId" uuid NOT NULL,
        CONSTRAINT "PK_workspace_authorization_watermarks" PRIMARY KEY ("WorkspaceId")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044037_AuthorizationWatermarks') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261106044037_AuthorizationWatermarks', '10.0.14');
    END IF;
END $EF$;
COMMIT;

