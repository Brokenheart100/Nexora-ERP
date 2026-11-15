START TRANSACTION;
DROP TABLE sales.record_changes;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261114045219_AddRecordChanges';

COMMIT;

