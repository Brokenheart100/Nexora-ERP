CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107061156_InitialAccountingBook') THEN
        IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'finance') THEN
            CREATE SCHEMA finance;
        END IF;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107061156_InitialAccountingBook') THEN
    CREATE TABLE finance.books (
        "WorkspaceId" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "IsPersonal" boolean NOT NULL,
        "OperationId" uuid NOT NULL,
        "BaseCurrency" character varying(3) NOT NULL,
        "StartsOn" date NOT NULL,
        "FiscalYearStartMonth" integer NOT NULL,
        "InitializedByIssuer" character varying(500) NOT NULL,
        "InitializedBySubject" character varying(200) NOT NULL,
        "InitializedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_books" PRIMARY KEY ("WorkspaceId"),
        CONSTRAINT "AK_books_TenantId_WorkspaceId" UNIQUE ("TenantId", "WorkspaceId")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107061156_InitialAccountingBook') THEN
    CREATE TABLE finance.chart_accounts (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        "Category" integer NOT NULL,
        CONSTRAINT "PK_chart_accounts" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_chart_accounts_books_TenantId_WorkspaceId" FOREIGN KEY ("TenantId", "WorkspaceId") REFERENCES finance.books ("TenantId", "WorkspaceId") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107061156_InitialAccountingBook') THEN
    CREATE UNIQUE INDEX "IX_chart_accounts_TenantId_WorkspaceId_Code" ON finance.chart_accounts ("TenantId", "WorkspaceId", "Code");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107061156_InitialAccountingBook') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107061156_InitialAccountingBook', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.chart_accounts ADD "IsArchived" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.chart_accounts ADD "IsUsed" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.chart_accounts ADD "ParentId" uuid;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.chart_accounts ADD "Purpose" integer NOT NULL DEFAULT 1;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.chart_accounts ADD "Version" bigint NOT NULL DEFAULT 1;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.books ADD "ChartRevision" bigint NOT NULL DEFAULT 1;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.books ADD "HasAccountingActivity" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.chart_accounts ADD CONSTRAINT "AK_chart_accounts_TenantId_WorkspaceId_Id" UNIQUE ("TenantId", "WorkspaceId", "Id");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    CREATE TABLE finance.chart_import_previews (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "Mode" character varying(12) NOT NULL,
        "Format" character varying(20) NOT NULL,
        "FileHash" character varying(64) NOT NULL,
        "ChartRevision" bigint NOT NULL,
        "RowsJson" text NOT NULL,
        "ExpiresAtUtc" timestamp with time zone NOT NULL,
        "CommittedRevision" bigint,
        CONSTRAINT "PK_chart_import_previews" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    CREATE TABLE finance.mutation_audit (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "OperationId" uuid NOT NULL,
        "Action" character varying(80) NOT NULL,
        "Fingerprint" character varying(64) NOT NULL,
        "TargetId" uuid,
        "ResultVersion" bigint NOT NULL,
        "OccurredAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_mutation_audit" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    CREATE INDEX "IX_chart_accounts_TenantId_WorkspaceId_ParentId" ON finance.chart_accounts ("TenantId", "WorkspaceId", "ParentId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    CREATE INDEX "IX_chart_import_previews_TenantId_WorkspaceId_ExpiresAtUtc" ON finance.chart_import_previews ("TenantId", "WorkspaceId", "ExpiresAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    CREATE UNIQUE INDEX "IX_mutation_audit_TenantId_WorkspaceId_Issuer_Subject_Operatio~" ON finance.mutation_audit ("TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    ALTER TABLE finance.chart_accounts ADD CONSTRAINT "FK_chart_accounts_chart_accounts_TenantId_WorkspaceId_ParentId" FOREIGN KEY ("TenantId", "WorkspaceId", "ParentId") REFERENCES finance.chart_accounts ("TenantId", "WorkspaceId", "Id") ON DELETE RESTRICT;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107065613_ChartLifecycleAndImports') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107065613_ChartLifecycleAndImports', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    CREATE TABLE finance.tax_assessments (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "SnapshotJson" jsonb NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_tax_assessments" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_tax_assessments_books_TenantId_WorkspaceId" FOREIGN KEY ("TenantId", "WorkspaceId") REFERENCES finance.books ("TenantId", "WorkspaceId") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    CREATE TABLE finance.tax_classifications (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Kind" character varying(7) NOT NULL,
        "ResourceId" uuid NOT NULL,
        "GroupCode" character varying(40) NOT NULL,
        "Version" bigint NOT NULL,
        "ReferenceVersion" bigint NOT NULL,
        CONSTRAINT "PK_tax_classifications" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_tax_classifications_books_TenantId_WorkspaceId" FOREIGN KEY ("TenantId", "WorkspaceId") REFERENCES finance.books ("TenantId", "WorkspaceId") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    CREATE TABLE finance.tax_groups (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        "Version" bigint NOT NULL,
        "RateCodes" character varying(327) NOT NULL,
        CONSTRAINT "PK_tax_groups" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_tax_groups_books_TenantId_WorkspaceId" FOREIGN KEY ("TenantId", "WorkspaceId") REFERENCES finance.books ("TenantId", "WorkspaceId") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    CREATE TABLE finance.tax_rates (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        "EffectiveOn" date NOT NULL,
        "Rate" numeric(7,6) NOT NULL,
        CONSTRAINT "PK_tax_rates" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_tax_rates_books_TenantId_WorkspaceId" FOREIGN KEY ("TenantId", "WorkspaceId") REFERENCES finance.books ("TenantId", "WorkspaceId") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    CREATE INDEX "IX_tax_assessments_TenantId_WorkspaceId" ON finance.tax_assessments ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    CREATE UNIQUE INDEX "IX_tax_classifications_TenantId_WorkspaceId_Kind_ResourceId_Ve~" ON finance.tax_classifications ("TenantId", "WorkspaceId", "Kind", "ResourceId", "Version");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    CREATE UNIQUE INDEX "IX_tax_groups_TenantId_WorkspaceId_Code_Version" ON finance.tax_groups ("TenantId", "WorkspaceId", "Code", "Version");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    CREATE UNIQUE INDEX "IX_tax_rates_TenantId_WorkspaceId_Code_EffectiveOn" ON finance.tax_rates ("TenantId", "WorkspaceId", "Code", "EffectiveOn");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107070659_TaxConfigurationAndSnapshots') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107070659_TaxConfigurationAndSnapshots', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    ALTER TABLE finance.books ADD "LastPostingNumber" bigint NOT NULL DEFAULT 0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE TABLE finance.fiscal_periods (
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Month" date NOT NULL,
        "State" integer NOT NULL,
        "Version" bigint NOT NULL,
        "ClosingWatermark" bigint,
        CONSTRAINT "PK_fiscal_periods" PRIMARY KEY ("TenantId", "WorkspaceId", "Month"),
        CONSTRAINT "FK_fiscal_periods_books_TenantId_WorkspaceId" FOREIGN KEY ("TenantId", "WorkspaceId") REFERENCES finance.books ("TenantId", "WorkspaceId") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE TABLE finance.journals (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Kind" integer NOT NULL,
        "SourceKey" character varying(87) NOT NULL,
        "SourceNumber" character varying(80) NOT NULL,
        "ReversesId" uuid,
        "MakerIssuer" character varying(500) NOT NULL,
        "MakerSubject" character varying(200) NOT NULL,
        "ReviewerIssuer" character varying(500),
        "ReviewerSubject" character varying(200),
        "ApprovedVersion" bigint,
        "State" integer NOT NULL,
        "On" date NOT NULL,
        "Memo" character varying(300) NOT NULL,
        "Version" bigint NOT NULL,
        "PostingNumber" bigint,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        "PostedAtUtc" timestamp with time zone,
        CONSTRAINT "PK_journals" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_journals_TenantId_WorkspaceId_Id" UNIQUE ("TenantId", "WorkspaceId", "Id"),
        CONSTRAINT "FK_journals_books_TenantId_WorkspaceId" FOREIGN KEY ("TenantId", "WorkspaceId") REFERENCES finance.books ("TenantId", "WorkspaceId") ON DELETE RESTRICT,
        CONSTRAINT "FK_journals_journals_TenantId_WorkspaceId_ReversesId" FOREIGN KEY ("TenantId", "WorkspaceId", "ReversesId") REFERENCES finance.journals ("TenantId", "WorkspaceId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE TABLE finance.period_transitions (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Month" date NOT NULL,
        "Version" bigint NOT NULL,
        "State" integer NOT NULL,
        "Watermark" bigint,
        "Reason" character varying(300) NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "OccurredAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_period_transitions" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_period_transitions_fiscal_periods_TenantId_WorkspaceId_Month" FOREIGN KEY ("TenantId", "WorkspaceId", "Month") REFERENCES finance.fiscal_periods ("TenantId", "WorkspaceId", "Month") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE TABLE finance.journal_lines (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "JournalId" uuid NOT NULL,
        "Ordinal" integer NOT NULL,
        "AccountId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        "Debit" numeric(20,6) NOT NULL,
        "Credit" numeric(20,6) NOT NULL,
        CONSTRAINT "PK_journal_lines" PRIMARY KEY ("Id"),
        CONSTRAINT ck_journal_line_amounts CHECK (("Debit" > 0 AND "Credit" = 0) OR ("Credit" > 0 AND "Debit" = 0)),
        CONSTRAINT "FK_journal_lines_chart_accounts_TenantId_WorkspaceId_AccountId" FOREIGN KEY ("TenantId", "WorkspaceId", "AccountId") REFERENCES finance.chart_accounts ("TenantId", "WorkspaceId", "Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_journal_lines_journals_TenantId_WorkspaceId_JournalId" FOREIGN KEY ("TenantId", "WorkspaceId", "JournalId") REFERENCES finance.journals ("TenantId", "WorkspaceId", "Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE INDEX "IX_journal_lines_TenantId_WorkspaceId_AccountId" ON finance.journal_lines ("TenantId", "WorkspaceId", "AccountId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE INDEX "IX_journal_lines_TenantId_WorkspaceId_JournalId" ON finance.journal_lines ("TenantId", "WorkspaceId", "JournalId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE INDEX "IX_journals_TenantId_WorkspaceId_On" ON finance.journals ("TenantId", "WorkspaceId", "On");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE UNIQUE INDEX "IX_journals_TenantId_WorkspaceId_PostingNumber" ON finance.journals ("TenantId", "WorkspaceId", "PostingNumber");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE INDEX "IX_journals_TenantId_WorkspaceId_ReversesId" ON finance.journals ("TenantId", "WorkspaceId", "ReversesId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE UNIQUE INDEX "IX_journals_TenantId_WorkspaceId_SourceKey" ON finance.journals ("TenantId", "WorkspaceId", "SourceKey") WHERE "State" <> 4;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    CREATE UNIQUE INDEX "IX_period_transitions_TenantId_WorkspaceId_Month_Version" ON finance.period_transitions ("TenantId", "WorkspaceId", "Month", "Version");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071556_PeriodsOpeningAndJournals') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107071556_PeriodsOpeningAndJournals', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE TABLE finance.bank_accounts (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "AccountId" uuid NOT NULL,
        "Code" character varying(40) NOT NULL,
        "Name" character varying(160) NOT NULL,
        "Kind" character varying(4) NOT NULL,
        "IsDefault" boolean NOT NULL,
        "Version" bigint NOT NULL,
        "Balance" numeric(28,6) NOT NULL,
        "Entries" bigint NOT NULL,
        CONSTRAINT "PK_bank_accounts" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE TABLE finance.bank_import_previews (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "BankId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "FileHash" character varying(64) NOT NULL,
        "Entries" jsonb NOT NULL,
        "ExpiresAtUtc" timestamp with time zone NOT NULL,
        "CommittedCount" integer,
        CONSTRAINT "PK_bank_import_previews" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE TABLE finance.bank_movements (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "BankId" uuid NOT NULL,
        "DocumentId" uuid NOT NULL,
        "JournalId" uuid NOT NULL,
        "On" date NOT NULL,
        "Amount" numeric(20,6) NOT NULL,
        "Matched" numeric(20,6) NOT NULL,
        "Voided" boolean NOT NULL,
        "ReversesId" uuid,
        CONSTRAINT "PK_bank_movements" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE TABLE finance.receipt_accruals (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "WarehouseId" uuid NOT NULL,
        "ItemId" uuid NOT NULL,
        "Sequence" bigint NOT NULL,
        "Fact" jsonb NOT NULL,
        "JournalId" uuid,
        "Posted" boolean NOT NULL,
        "PendingReason" character varying(300),
        "AccrualAccountId" uuid,
        "MatchedQuantity" numeric(20,6) NOT NULL,
        "MatchedCost" numeric(20,6) NOT NULL,
        "ReturnedQuantity" numeric(20,6) NOT NULL,
        "ReturnedCost" numeric(20,6) NOT NULL,
        "CreditedQuantity" numeric(20,6) NOT NULL,
        CONSTRAINT "PK_receipt_accruals" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE TABLE finance.statement_lines (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "BankId" uuid NOT NULL,
        "BatchId" uuid NOT NULL,
        "Row" integer NOT NULL,
        "ExternalId" character varying(120) NOT NULL,
        "On" date NOT NULL,
        "Amount" numeric(20,6) NOT NULL,
        "Description" character varying(300) NOT NULL,
        "Matched" numeric(20,6) NOT NULL,
        "Version" bigint NOT NULL,
        "Excluded" boolean NOT NULL,
        CONSTRAINT "PK_statement_lines" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE TABLE finance.statement_matches (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "StatementLineId" uuid NOT NULL,
        "MovementId" uuid NOT NULL,
        "ReferenceId" uuid NOT NULL,
        "Amount" numeric(20,6) NOT NULL,
        "Reversed" boolean NOT NULL,
        CONSTRAINT "PK_statement_matches" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE TABLE finance.trade_documents (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Number" character varying(60) NOT NULL,
        "Terms" jsonb NOT NULL,
        "State" integer NOT NULL,
        "MakerIssuer" character varying(500) NOT NULL,
        "MakerSubject" character varying(200) NOT NULL,
        "JournalId" uuid,
        "ReversedById" uuid,
        "Outstanding" numeric(20,6) NOT NULL,
        "Total" numeric(20,6) NOT NULL,
        "PurchaseVariance" numeric(20,6) NOT NULL,
        "CreditedQuantity" numeric(20,6) NOT NULL,
        "CreditedNet" numeric(20,6) NOT NULL,
        "CreditedTax" numeric(20,6) NOT NULL,
        "PartnerVersion" bigint,
        "Version" bigint NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_trade_documents" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE TABLE finance.trade_setup (
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Version" bigint NOT NULL,
        "InventoryAccountId" uuid NOT NULL,
        "AccrualAccountId" uuid NOT NULL,
        "PayableAccountId" uuid NOT NULL,
        "InputTaxAccountId" uuid NOT NULL,
        "VarianceAccountId" uuid NOT NULL,
        "DonationIncomeAccountId" uuid NOT NULL,
        CONSTRAINT "PK_trade_setup" PRIMARY KEY ("TenantId", "WorkspaceId")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_bank_accounts_TenantId_WorkspaceId" ON finance.bank_accounts ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE UNIQUE INDEX "IX_bank_accounts_TenantId_WorkspaceId_AccountId" ON finance.bank_accounts ("TenantId", "WorkspaceId", "AccountId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE UNIQUE INDEX "IX_bank_accounts_TenantId_WorkspaceId_Code" ON finance.bank_accounts ("TenantId", "WorkspaceId", "Code");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_bank_import_previews_TenantId_WorkspaceId" ON finance.bank_import_previews ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_bank_movements_TenantId_WorkspaceId" ON finance.bank_movements ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_bank_movements_TenantId_WorkspaceId_BankId_On" ON finance.bank_movements ("TenantId", "WorkspaceId", "BankId", "On");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_bank_movements_TenantId_WorkspaceId_DocumentId" ON finance.bank_movements ("TenantId", "WorkspaceId", "DocumentId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_receipt_accruals_TenantId_WorkspaceId" ON finance.receipt_accruals ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE UNIQUE INDEX "IX_receipt_accruals_TenantId_WorkspaceId_WarehouseId_ItemId_Se~" ON finance.receipt_accruals ("TenantId", "WorkspaceId", "WarehouseId", "ItemId", "Sequence");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_statement_lines_TenantId_WorkspaceId" ON finance.statement_lines ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE UNIQUE INDEX "IX_statement_lines_TenantId_WorkspaceId_BankId_ExternalId" ON finance.statement_lines ("TenantId", "WorkspaceId", "BankId", "ExternalId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_statement_matches_TenantId_WorkspaceId" ON finance.statement_matches ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_statement_matches_TenantId_WorkspaceId_StatementLineId" ON finance.statement_matches ("TenantId", "WorkspaceId", "StatementLineId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE INDEX "IX_trade_documents_TenantId_WorkspaceId" ON finance.trade_documents ("TenantId", "WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    CREATE UNIQUE INDEX "IX_trade_documents_TenantId_WorkspaceId_Number" ON finance.trade_documents ("TenantId", "WorkspaceId", "Number");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042027_SupplierTradeAndBanking') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108042027_SupplierTradeAndBanking', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042715_SupplierReturnRecoveries') THEN
    ALTER TABLE finance.trade_setup ADD "SupplierRecoveryAccountId" uuid;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042715_SupplierReturnRecoveries') THEN
    ALTER TABLE finance.trade_documents ADD "CreditedPayable" numeric(20,6) NOT NULL DEFAULT 0.0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042715_SupplierReturnRecoveries') THEN
    ALTER TABLE finance.trade_documents ADD "Recoverable" numeric(20,6) NOT NULL DEFAULT 0.0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042715_SupplierReturnRecoveries') THEN
    ALTER TABLE finance.trade_documents ADD "RecoveryTotal" numeric(20,6) NOT NULL DEFAULT 0.0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108042715_SupplierReturnRecoveries') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108042715_SupplierReturnRecoveries', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108044017_MultiReceiptSupplierBills') THEN
    ALTER TABLE finance.trade_documents ADD "BillMatches" jsonb;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108044017_MultiReceiptSupplierBills') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108044017_MultiReceiptSupplierBills', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    ALTER TABLE finance.trade_documents ADD "InvoiceReserved" numeric NOT NULL DEFAULT 0.0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    ALTER TABLE finance.receipt_accruals ADD "InvoiceReserved" numeric(20,6) NOT NULL DEFAULT 0.0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    ALTER TABLE finance.receipt_accruals ADD "IsSales" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE TABLE finance.customer_documents (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Terms" jsonb NOT NULL,
        "Number" character varying(60) NOT NULL,
        "MakerIssuer" character varying(500) NOT NULL,
        "MakerSubject" character varying(200) NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        "Version" bigint NOT NULL,
        "State" integer NOT NULL,
        "JournalId" uuid,
        "OpenBalance" numeric(20,6) NOT NULL,
        CONSTRAINT "PK_customer_documents" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE TABLE finance.invoice_dispatches (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "InvoiceId" uuid NOT NULL,
        "JournalId" uuid NOT NULL,
        "Recipient" character varying(254) NOT NULL,
        "PreviousId" uuid,
        "ResentAsId" uuid,
        "State" integer NOT NULL,
        "Attempt" integer NOT NULL,
        "Version" bigint NOT NULL,
        "UpdatedAtUtc" timestamp with time zone NOT NULL,
        "LeaseUntilUtc" timestamp with time zone,
        "Detail" character varying(300),
        CONSTRAINT "PK_invoice_dispatches" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE TABLE finance.invoice_schedules (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Terms" jsonb NOT NULL,
        "NextOn" date,
        "LastOn" date,
        "Paused" boolean NOT NULL,
        "Version" bigint NOT NULL,
        "MakerIssuer" character varying(500) NOT NULL,
        "MakerSubject" character varying(200) NOT NULL,
        "PendingReason" character varying(500),
        CONSTRAINT "PK_invoice_schedules" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_invoice_schedules_TenantId_WorkspaceId_Id" UNIQUE ("TenantId", "WorkspaceId", "Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE TABLE finance.invoice_shares (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "InvoiceId" uuid NOT NULL,
        "JournalId" uuid NOT NULL,
        "TokenHash" character varying(64) NOT NULL,
        "ExpiresAtUtc" timestamp with time zone NOT NULL,
        "RevokedAtUtc" timestamp with time zone,
        CONSTRAINT "PK_invoice_shares" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE TABLE finance.receivable_setup (
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Accounts" jsonb NOT NULL,
        CONSTRAINT "PK_receivable_setup" PRIMARY KEY ("TenantId", "WorkspaceId")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE TABLE finance.invoice_occurrences (
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "ScheduleId" uuid NOT NULL,
        "On" date NOT NULL,
        "TemplateVersion" bigint NOT NULL,
        "DocumentId" uuid NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_invoice_occurrences" PRIMARY KEY ("TenantId", "WorkspaceId", "ScheduleId", "On"),
        CONSTRAINT "FK_invoice_occurrences_invoice_schedules_TenantId_WorkspaceId_~" FOREIGN KEY ("TenantId", "WorkspaceId", "ScheduleId") REFERENCES finance.invoice_schedules ("TenantId", "WorkspaceId", "Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE INDEX "IX_customer_documents_TenantId_WorkspaceId_Id" ON finance.customer_documents ("TenantId", "WorkspaceId", "Id");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE UNIQUE INDEX "IX_customer_documents_TenantId_WorkspaceId_Number" ON finance.customer_documents ("TenantId", "WorkspaceId", "Number");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE INDEX "IX_invoice_dispatches_TenantId_WorkspaceId_InvoiceId" ON finance.invoice_dispatches ("TenantId", "WorkspaceId", "InvoiceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE INDEX "IX_invoice_shares_TenantId_WorkspaceId_InvoiceId" ON finance.invoice_shares ("TenantId", "WorkspaceId", "InvoiceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    CREATE UNIQUE INDEX "IX_invoice_shares_TokenHash" ON finance.invoice_shares ("TokenHash");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108052856_CustomerReceivables') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108052856_CustomerReceivables', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108054514_ShipmentInvoiceAmounts') THEN
    ALTER TABLE finance.trade_documents DROP COLUMN "InvoiceReserved";
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108054514_ShipmentInvoiceAmounts') THEN
    ALTER TABLE finance.receipt_accruals ADD "InvoicePostedNet" numeric(20,6) NOT NULL DEFAULT 0.0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108054514_ShipmentInvoiceAmounts') THEN
    ALTER TABLE finance.receipt_accruals ADD "InvoiceReservedNet" numeric(20,6) NOT NULL DEFAULT 0.0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108054514_ShipmentInvoiceAmounts') THEN
    WITH totals AS (
        SELECT d."TenantId", d."WorkspaceId", (line->>'ShipmentId')::uuid AS shipment,
            COALESCE(SUM((line->>'Net')::numeric) FILTER (WHERE d."State" = 1), 0) AS reserved,
            COALESCE(SUM((line->>'Net')::numeric) FILTER (WHERE d."State" = 2), 0) AS posted
        FROM finance.customer_documents d
        CROSS JOIN LATERAL jsonb_array_elements(
            CASE WHEN jsonb_typeof(d."Terms"->'Lines') = 'array' THEN d."Terms"->'Lines' ELSE '[]'::jsonb END
        ) AS line
        WHERE d."Terms"->>'Kind' = '1' AND d."State" IN (1, 2) AND line->>'ShipmentId' IS NOT NULL
        GROUP BY d."TenantId", d."WorkspaceId", (line->>'ShipmentId')::uuid
    )
    UPDATE finance.receipt_accruals a
    SET "InvoiceReservedNet" = t.reserved, "InvoicePostedNet" = t.posted
    FROM totals t
    WHERE a."TenantId" = t."TenantId" AND a."WorkspaceId" = t."WorkspaceId" AND a."Id" = t.shipment AND a."IsSales";
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108054514_ShipmentInvoiceAmounts') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108054514_ShipmentInvoiceAmounts', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108083844_FinancialClosingControls') THEN
    ALTER TABLE finance.journals ADD "CashActivity" integer;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108083844_FinancialClosingControls') THEN
    CREATE TABLE finance.bank_reconciliations (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "BankId" uuid NOT NULL,
        "Through" date NOT NULL,
        "StatementBalance" numeric(20,6) NOT NULL,
        "Snapshot" text NOT NULL,
        "MakerIssuer" character varying(500) NOT NULL,
        "MakerSubject" character varying(200) NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        "CompletedAtUtc" timestamp with time zone,
        "UndoReason" character varying(300),
        "State" integer NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_bank_reconciliations" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108083844_FinancialClosingControls') THEN
    CREATE TABLE finance.fiscal_year_closings (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "First" date NOT NULL,
        "Last" date NOT NULL,
        "EquityAccountId" uuid NOT NULL,
        "Snapshot" text NOT NULL,
        "MakerIssuer" character varying(500) NOT NULL,
        "MakerSubject" character varying(200) NOT NULL,
        "ClosingJournals" uuid[] NOT NULL,
        "ReopeningJournals" uuid[] NOT NULL,
        "ReopenReason" character varying(300),
        "Version" bigint NOT NULL,
        "State" integer NOT NULL,
        CONSTRAINT "PK_fiscal_year_closings" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108083844_FinancialClosingControls') THEN
    CREATE UNIQUE INDEX "IX_bank_reconciliations_TenantId_WorkspaceId_BankId_Through" ON finance.bank_reconciliations ("TenantId", "WorkspaceId", "BankId", "Through") WHERE "State" = 2;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108083844_FinancialClosingControls') THEN
    CREATE UNIQUE INDEX "IX_fiscal_year_closings_TenantId_WorkspaceId_First" ON finance.fiscal_year_closings ("TenantId", "WorkspaceId", "First") WHERE "State" = 2;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108083844_FinancialClosingControls') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108083844_FinancialClosingControls', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108084802_DurableReportExports') THEN
    CREATE TABLE finance.report_exports (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "Kind" character varying(20) NOT NULL,
        "Watermark" bigint NOT NULL,
        "Snapshot" text NOT NULL,
        "RequestedAtUtc" timestamp with time zone NOT NULL,
        "CompletedAtUtc" timestamp with time zone,
        "File" bytea,
        CONSTRAINT "PK_report_exports" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108084802_DurableReportExports') THEN
    CREATE INDEX "IX_report_exports_TenantId_WorkspaceId_Issuer_Subject_Requeste~" ON finance.report_exports ("TenantId", "WorkspaceId", "Issuer", "Subject", "RequestedAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108084802_DurableReportExports') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108084802_DurableReportExports', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114041658_AddJournalLinks') THEN
    CREATE TABLE finance.journal_links (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "FromJournalId" uuid NOT NULL,
        "ToJournalId" uuid NOT NULL,
        "Kind" character varying(24) NOT NULL,
        "Memo" character varying(300) NOT NULL,
        "CreatedByIssuer" character varying(500) NOT NULL,
        "CreatedBySubject" character varying(200) NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_journal_links" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114041658_AddJournalLinks') THEN
    CREATE INDEX "IX_journal_links_TenantId_WorkspaceId_CreatedAtUtc" ON finance.journal_links ("TenantId", "WorkspaceId", "CreatedAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114041658_AddJournalLinks') THEN
    CREATE UNIQUE INDEX "IX_journal_links_TenantId_WorkspaceId_FromJournalId_ToJournalI~" ON finance.journal_links ("TenantId", "WorkspaceId", "FromJournalId", "ToJournalId", "Kind");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114041658_AddJournalLinks') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261114041658_AddJournalLinks', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045206_AddRecordChanges') THEN
    CREATE TABLE finance.record_changes (
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
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045206_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_EntityName_EntityId" ON finance.record_changes ("TenantId", "WorkspaceId", "EntityName", "EntityId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045206_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_OccurredAtUtc" ON finance.record_changes ("TenantId", "WorkspaceId", "OccurredAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045206_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_Operation" ON finance.record_changes ("TenantId", "WorkspaceId", "Operation");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045206_AddRecordChanges') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261114045206_AddRecordChanges', '10.0.14');
    END IF;
END $EF$;
COMMIT;

