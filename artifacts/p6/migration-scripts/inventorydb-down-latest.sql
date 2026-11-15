START TRANSACTION;
DROP TABLE inventory.record_changes;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261114045228_AddRecordChanges';

COMMIT;

