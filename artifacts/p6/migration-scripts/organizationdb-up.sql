CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL,
    CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId")
);

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033844_InitialWorkspace') THEN
        IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname = 'organization') THEN
            CREATE SCHEMA organization;
        END IF;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033844_InitialWorkspace') THEN
    CREATE TABLE organization.workspace_audit (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Action" character varying(100) NOT NULL,
        "ActorIssuer" character varying(500) NOT NULL,
        "ActorSubject" character varying(200) NOT NULL,
        "OccurredAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_workspace_audit" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033844_InitialWorkspace') THEN
    CREATE TABLE organization.workspaces (
        "Id" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "OperationId" uuid NOT NULL,
        "Name" character varying(160) NOT NULL,
        "CountryCode" character varying(2) NOT NULL,
        "BaseCurrency" character varying(3) NOT NULL,
        "OwnerIssuer" character varying(500) NOT NULL,
        "OwnerSubject" character varying(200) NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_workspaces" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033844_InitialWorkspace') THEN
    CREATE UNIQUE INDEX "IX_workspaces_OwnerIssuer_OwnerSubject_OperationId" ON organization.workspaces ("OwnerIssuer", "OwnerSubject", "OperationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106033844_InitialWorkspace') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261106033844_InitialWorkspace', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    ALTER TABLE organization.workspace_audit ADD "AuthorizationVersion" bigint;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    ALTER TABLE organization.workspace_audit ADD "TargetId" uuid;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    CREATE TABLE organization.user_accounts (
        "Id" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "VerifiedEmail" character varying(254),
        "IsActive" boolean NOT NULL,
        CONSTRAINT "PK_user_accounts" PRIMARY KEY ("Id"),
        CONSTRAINT "AK_user_accounts_Issuer_Subject" UNIQUE ("Issuer", "Subject")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    CREATE TABLE organization.workspace_invitations (
        "Id" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "OperationId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Email" character varying(254) NOT NULL,
        "Role" character varying(80) NOT NULL,
        "TokenHash" character varying(64) NOT NULL,
        "InviterIssuer" character varying(500) NOT NULL,
        "InviterSubject" character varying(200) NOT NULL,
        "CreatedAtUtc" timestamp with time zone NOT NULL,
        "ExpiresAtUtc" timestamp with time zone NOT NULL,
        "State" character varying(20) NOT NULL,
        "AcceptedSubject" character varying(200),
        CONSTRAINT "PK_workspace_invitations" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_workspace_invitations_workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES organization.workspaces ("Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    CREATE TABLE organization.workspace_members (
        "Id" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "Role" character varying(80) NOT NULL,
        "IsActive" boolean NOT NULL,
        "JoinedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_workspace_members" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_workspace_members_user_accounts_Issuer_Subject" FOREIGN KEY ("Issuer", "Subject") REFERENCES organization.user_accounts ("Issuer", "Subject") ON DELETE RESTRICT,
        CONSTRAINT "FK_workspace_members_workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES organization.workspaces ("Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    CREATE UNIQUE INDEX "IX_workspace_invitations_WorkspaceId_OperationId" ON organization.workspace_invitations ("WorkspaceId", "OperationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    CREATE INDEX "IX_workspace_members_Issuer_Subject" ON organization.workspace_members ("Issuer", "Subject");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    CREATE UNIQUE INDEX "IX_workspace_members_WorkspaceId_Issuer_Subject" ON organization.workspace_members ("WorkspaceId", "Issuer", "Subject");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    INSERT INTO organization.user_accounts ("Id", "Issuer", "Subject", "IsActive")
    SELECT gen_random_uuid(), owners."OwnerIssuer", owners."OwnerSubject", TRUE
    FROM (SELECT DISTINCT "OwnerIssuer", "OwnerSubject" FROM organization.workspaces) owners;
    INSERT INTO organization.workspace_members ("Id", "WorkspaceId", "Issuer", "Subject", "Role", "IsActive", "JoinedAtUtc")
    SELECT gen_random_uuid(), "Id", "OwnerIssuer", "OwnerSubject", 'WorkspaceOwner', TRUE, "CreatedAtUtc"
    FROM organization.workspaces;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261106044032_WorkspaceGovernance') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261106044032_WorkspaceGovernance', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107060400_WorkspacePresentationAndLinks') THEN
    ALTER TABLE organization.workspaces ADD "IsPersonal" boolean NOT NULL DEFAULT FALSE;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107060400_WorkspacePresentationAndLinks') THEN
    CREATE TABLE organization.workspace_navigation_links (
        "PersonalWorkspaceId" uuid NOT NULL,
        "CompanyWorkspaceId" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "IsActive" boolean NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_workspace_navigation_links" PRIMARY KEY ("PersonalWorkspaceId", "CompanyWorkspaceId"),
        CONSTRAINT "FK_workspace_navigation_links_workspaces_CompanyWorkspaceId" FOREIGN KEY ("CompanyWorkspaceId") REFERENCES organization.workspaces ("Id") ON DELETE RESTRICT,
        CONSTRAINT "FK_workspace_navigation_links_workspaces_PersonalWorkspaceId" FOREIGN KEY ("PersonalWorkspaceId") REFERENCES organization.workspaces ("Id") ON DELETE RESTRICT
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107060400_WorkspacePresentationAndLinks') THEN
    CREATE TABLE organization.workspace_preferences (
        "WorkspaceId" uuid NOT NULL,
        "TenantId" uuid NOT NULL,
        "LegalName" character varying(160) NOT NULL,
        "BrandName" character varying(160) NOT NULL,
        "AccentColor" character varying(7) NOT NULL,
        "DateFormat" character varying(24) NOT NULL,
        "TimeZone" character varying(80) NOT NULL,
        "LogoDataUrl" character varying(175000),
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_workspace_preferences" PRIMARY KEY ("WorkspaceId"),
        CONSTRAINT "FK_workspace_preferences_workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES organization.workspaces ("Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107060400_WorkspacePresentationAndLinks') THEN
    CREATE UNIQUE INDEX "IX_workspaces_OwnerIssuer_OwnerSubject" ON organization.workspaces ("OwnerIssuer", "OwnerSubject") WHERE "IsPersonal";
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107060400_WorkspacePresentationAndLinks') THEN
    CREATE INDEX "IX_workspace_navigation_links_CompanyWorkspaceId" ON organization.workspace_navigation_links ("CompanyWorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107060400_WorkspacePresentationAndLinks') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107060400_WorkspacePresentationAndLinks', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071146_FinanceRoleApprovals') THEN
    ALTER TABLE organization.workspace_members ADD "FinanceRole" character varying(30);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071146_FinanceRoleApprovals') THEN
    ALTER TABLE organization.workspace_members ADD "FinanceRoleProposalExpiresAtUtc" timestamp with time zone;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071146_FinanceRoleApprovals') THEN
    ALTER TABLE organization.workspace_members ADD "FinanceRoleProposalVersion" bigint;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071146_FinanceRoleApprovals') THEN
    ALTER TABLE organization.workspace_members ADD "FinanceRoleProposerId" uuid;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071146_FinanceRoleApprovals') THEN
    ALTER TABLE organization.workspace_members ADD "ProposedFinanceRole" character varying(30);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107071146_FinanceRoleApprovals') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107071146_FinanceRoleApprovals', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081307_PurchaseRoleGrants') THEN
    ALTER TABLE organization.workspace_members ADD "PurchaseRole" character varying(30);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261107081307_PurchaseRoleGrants') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261107081307_PurchaseRoleGrants', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108051212_SalesExecutionRoles') THEN
    ALTER TABLE organization.workspace_members ADD "SalesRole" character varying(30);
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261108051212_SalesExecutionRoles') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261108051212_SalesExecutionRoles', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112090355_BusinessRoleApprovals') THEN
    ALTER TABLE organization.workspace_members ADD "ProposedBusinessRoles" text[];
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112090355_BusinessRoleApprovals') THEN
    ALTER TABLE organization.workspace_invitations ADD "ApproverMemberId" uuid;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112090355_BusinessRoleApprovals') THEN
    ALTER TABLE organization.workspace_invitations ADD "BusinessRoles" text[];
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112090355_BusinessRoleApprovals') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261112090355_BusinessRoleApprovals', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092922_CustomRoleScopes') THEN
    CREATE TABLE organization.workspace_custom_roles (
        "Id" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Name" character varying(80) NOT NULL,
        "Permissions" text[] NOT NULL,
        "Revision" bigint NOT NULL,
        CONSTRAINT "PK_workspace_custom_roles" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_workspace_custom_roles_workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES organization.workspaces ("Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092922_CustomRoleScopes') THEN
    CREATE TABLE organization.workspace_departments (
        "Id" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "Name" character varying(80) NOT NULL,
        CONSTRAINT "PK_workspace_departments" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_workspace_departments_workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES organization.workspaces ("Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092922_CustomRoleScopes') THEN
    CREATE TABLE organization.workspace_role_grants (
        "Id" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "MemberId" uuid NOT NULL,
        "RoleId" uuid NOT NULL,
        "RoleRevision" bigint NOT NULL,
        "Permissions" text[] NOT NULL,
        "Scope" character varying(16) NOT NULL,
        "ScopeId" uuid,
        "RequestedBy" uuid NOT NULL,
        "ApprovedBy" uuid,
        "ExpiresAtUtc" timestamp with time zone NOT NULL,
        "State" character varying(16) NOT NULL,
        CONSTRAINT "PK_workspace_role_grants" PRIMARY KEY ("Id"),
        CONSTRAINT "FK_workspace_role_grants_workspaces_WorkspaceId" FOREIGN KEY ("WorkspaceId") REFERENCES organization.workspaces ("Id") ON DELETE CASCADE
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092922_CustomRoleScopes') THEN
    CREATE INDEX "IX_workspace_custom_roles_WorkspaceId" ON organization.workspace_custom_roles ("WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092922_CustomRoleScopes') THEN
    CREATE INDEX "IX_workspace_departments_WorkspaceId" ON organization.workspace_departments ("WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092922_CustomRoleScopes') THEN
    CREATE INDEX "IX_workspace_role_grants_WorkspaceId" ON organization.workspace_role_grants ("WorkspaceId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261112092922_CustomRoleScopes') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261112092922_CustomRoleScopes', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    CREATE TABLE organization.billing_document_usage (
        "BillingAccountId" uuid NOT NULL,
        "PeriodMonth" date NOT NULL,
        "Documents" integer NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_billing_document_usage" PRIMARY KEY ("BillingAccountId", "PeriodMonth")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    CREATE TABLE organization.billing_invoices (
        "Id" uuid NOT NULL,
        "BillingAccountId" uuid NOT NULL,
        "WorkspaceId" uuid NOT NULL,
        "PlanCode" character varying(40) NOT NULL,
        "Status" character varying(20) NOT NULL,
        "AmountCents" integer NOT NULL,
        "Currency" character varying(3) NOT NULL,
        "PaymentReference" character varying(120),
        "OperationId" uuid NOT NULL,
        "PaymentOperationId" uuid,
        "IssuedAtUtc" timestamp with time zone NOT NULL,
        "PaidAtUtc" timestamp with time zone,
        CONSTRAINT "PK_billing_invoices" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    CREATE TABLE organization.billing_subscriptions (
        "Id" uuid NOT NULL,
        "Issuer" character varying(500) NOT NULL,
        "Subject" character varying(200) NOT NULL,
        "PlanCode" character varying(40) NOT NULL,
        "Status" character varying(20) NOT NULL,
        "OperationId" uuid NOT NULL,
        "PeriodStartUtc" timestamp with time zone,
        "PeriodEndUtc" timestamp with time zone,
        "UpdatedAtUtc" timestamp with time zone NOT NULL,
        "Version" bigint NOT NULL,
        CONSTRAINT "PK_billing_subscriptions" PRIMARY KEY ("Id")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    CREATE TABLE organization.billing_usage_reservations (
        "OperationId" uuid NOT NULL,
        "BillingAccountId" uuid NOT NULL,
        "PeriodMonth" date NOT NULL,
        "Count" integer NOT NULL,
        "RecordedAtUtc" timestamp with time zone NOT NULL,
        CONSTRAINT "PK_billing_usage_reservations" PRIMARY KEY ("OperationId")
    );
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    CREATE INDEX "IX_billing_invoices_BillingAccountId_IssuedAtUtc" ON organization.billing_invoices ("BillingAccountId", "IssuedAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    CREATE UNIQUE INDEX "IX_billing_invoices_OperationId" ON organization.billing_invoices ("OperationId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    CREATE UNIQUE INDEX "IX_billing_invoices_PaymentOperationId" ON organization.billing_invoices ("PaymentOperationId") WHERE "PaymentOperationId" IS NOT NULL;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    CREATE UNIQUE INDEX "IX_billing_subscriptions_Issuer_Subject" ON organization.billing_subscriptions ("Issuer", "Subject");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261113145503_AddBilling') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261113145503_AddBilling', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045210_AddRecordChanges') THEN
    CREATE TABLE organization.record_changes (
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
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045210_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_EntityName_EntityId" ON organization.record_changes ("TenantId", "WorkspaceId", "EntityName", "EntityId");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045210_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_OccurredAtUtc" ON organization.record_changes ("TenantId", "WorkspaceId", "OccurredAtUtc");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045210_AddRecordChanges') THEN
    CREATE INDEX "IX_record_changes_TenantId_WorkspaceId_Operation" ON organization.record_changes ("TenantId", "WorkspaceId", "Operation");
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114045210_AddRecordChanges') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261114045210_AddRecordChanges', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114141156_AddWorkspaceSessionIdleMinutesColumn') THEN
    ALTER TABLE organization.workspace_preferences ADD "SessionIdleMinutes" integer NOT NULL DEFAULT 30;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261114141156_AddWorkspaceSessionIdleMinutesColumn') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261114141156_AddWorkspaceSessionIdleMinutesColumn', '10.0.14');
    END IF;
END $EF$;
COMMIT;

START TRANSACTION;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261115062311_AddRoleGrantPeriodsAndApprovals') THEN
    ALTER TABLE organization.workspace_role_grants ADD "ApprovalCount" integer NOT NULL DEFAULT 0;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261115062311_AddRoleGrantPeriodsAndApprovals') THEN
    ALTER TABLE organization.workspace_role_grants ADD "EndsOn" date;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261115062311_AddRoleGrantPeriodsAndApprovals') THEN
    ALTER TABLE organization.workspace_role_grants ADD "FirstApprovedBy" uuid;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261115062311_AddRoleGrantPeriodsAndApprovals') THEN
    ALTER TABLE organization.workspace_role_grants ADD "RequiredApprovals" integer NOT NULL DEFAULT 1;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261115062311_AddRoleGrantPeriodsAndApprovals') THEN
    ALTER TABLE organization.workspace_role_grants ADD "StartsOn" date;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261115062311_AddRoleGrantPeriodsAndApprovals') THEN
    ALTER TABLE organization.workspace_preferences ADD "RoleGrantApprovals" integer NOT NULL DEFAULT 1;
    END IF;
END $EF$;

DO $EF$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM "__EFMigrationsHistory" WHERE "MigrationId" = '20261115062311_AddRoleGrantPeriodsAndApprovals') THEN
    INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
    VALUES ('20261115062311_AddRoleGrantPeriodsAndApprovals', '10.0.14');
    END IF;
END $EF$;
COMMIT;

