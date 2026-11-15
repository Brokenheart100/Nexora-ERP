START TRANSACTION;
DROP TABLE finance.record_changes;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261114045206_AddRecordChanges';

COMMIT;

