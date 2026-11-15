START TRANSACTION;
DROP TABLE purchasing.record_changes;

DELETE FROM "__EFMigrationsHistory"
WHERE "MigrationId" = '20261114045224_AddRecordChanges';

COMMIT;

