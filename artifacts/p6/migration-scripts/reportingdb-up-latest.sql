START TRANSACTION;
CREATE TABLE reporting.workspace_authorization_watermarks (
    "WorkspaceId" uuid NOT NULL,
    "TenantId" uuid NOT NULL,
    "Version" bigint NOT NULL,
    "LastEventId" uuid NOT NULL,
    CONSTRAINT "PK_workspace_authorization_watermarks" PRIMARY KEY ("WorkspaceId")
);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261106044037_AuthorizationWatermarks', '10.0.14');

COMMIT;

