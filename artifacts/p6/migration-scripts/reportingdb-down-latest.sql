START TRANSACTION;
DROP TABLE reporting.workspace_authorization_watermarks;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261106044037_AuthorizationWatermarks';

COMMIT;

