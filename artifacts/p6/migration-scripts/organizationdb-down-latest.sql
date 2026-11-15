START TRANSACTION;
ALTER TABLE organization.workspace_role_grants DROP COLUMN "ApprovalCount";

ALTER TABLE organization.workspace_role_grants DROP COLUMN "EndsOn";

ALTER TABLE organization.workspace_role_grants DROP COLUMN "FirstApprovedBy";

ALTER TABLE organization.workspace_role_grants DROP COLUMN "RequiredApprovals";

ALTER TABLE organization.workspace_role_grants DROP COLUMN "StartsOn";

ALTER TABLE organization.workspace_preferences DROP COLUMN "RoleGrantApprovals";

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261115062311_AddRoleGrantPeriodsAndApprovals';

COMMIT;

