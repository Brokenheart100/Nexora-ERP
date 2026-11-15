START TRANSACTION;
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

CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_EntityName_EntityId" ON inventory.record_changes ("TenantId", "WorkspaceId", "EntityName", "EntityId");

CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_OccurredAtUtc" ON inventory.record_changes ("TenantId", "WorkspaceId", "OccurredAtUtc");

CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_Operation" ON inventory.record_changes ("TenantId", "WorkspaceId", "Operation");

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261114045228_AddRecordChanges', '10.0.14');

COMMIT;

