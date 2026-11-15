START TRANSACTION;
DROP TABLE masterdata.record_changes;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261114045215_AddRecordChanges';

COMMIT;

