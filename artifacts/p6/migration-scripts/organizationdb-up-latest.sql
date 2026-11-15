START TRANSACTION;
ALTER TABLE organization.workspace_role_grants ADD "ApprovalCount" integer NOT NULL DEFAULT 0;

ALTER TABLE organization.workspace_role_grants ADD "EndsOn" date;

ALTER TABLE organization.workspace_role_grants ADD "FirstApprovedBy" uuid;

ALTER TABLE organization.workspace_role_grants ADD "RequiredApprovals" integer NOT NULL DEFAULT 1;

ALTER TABLE organization.workspace_role_grants ADD "StartsOn" date;

ALTER TABLE organization.workspace_preferences ADD "RoleGrantApprovals" integer NOT NULL DEFAULT 1;

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261115062311_AddRoleGrantPeriodsAndApprovals', '10.0.14');

COMMIT;

