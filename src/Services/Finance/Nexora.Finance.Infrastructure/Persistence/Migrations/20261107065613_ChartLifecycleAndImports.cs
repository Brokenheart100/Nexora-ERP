using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ChartLifecycleAndImports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsArchived",
                schema: "finance",
                table: "chart_accounts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsUsed",
                schema: "finance",
                table: "chart_accounts",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "ParentId",
                schema: "finance",
                table: "chart_accounts",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "Purpose",
                schema: "finance",
                table: "chart_accounts",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<long>(
                name: "Version",
                schema: "finance",
                table: "chart_accounts",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<long>(
                name: "ChartRevision",
                schema: "finance",
                table: "books",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<bool>(
                name: "HasAccountingActivity",
                schema: "finance",
                table: "books",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_chart_accounts_TenantId_WorkspaceId_Id",
                schema: "finance",
                table: "chart_accounts",
                columns: new[] { "TenantId", "WorkspaceId", "Id" });

            migrationBuilder.CreateTable(
                name: "chart_import_previews",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Mode = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: false),
                    Format = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    FileHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ChartRevision = table.Column<long>(type: "bigint", nullable: false),
                    RowsJson = table.Column<string>(type: "text", nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CommittedRevision = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chart_import_previews", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "mutation_audit",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: true),
                    ResultVersion = table.Column<long>(type: "bigint", nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mutation_audit", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_chart_accounts_TenantId_WorkspaceId_ParentId",
                schema: "finance",
                table: "chart_accounts",
                columns: new[] { "TenantId", "WorkspaceId", "ParentId" });

            migrationBuilder.CreateIndex(
                name: "IX_chart_import_previews_TenantId_WorkspaceId_ExpiresAtUtc",
                schema: "finance",
                table: "chart_import_previews",
                columns: new[] { "TenantId", "WorkspaceId", "ExpiresAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_mutation_audit_TenantId_WorkspaceId_Issuer_Subject_Operatio~",
                schema: "finance",
                table: "mutation_audit",
                columns: new[] { "TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_chart_accounts_chart_accounts_TenantId_WorkspaceId_ParentId",
                schema: "finance",
                table: "chart_accounts",
                columns: new[] { "TenantId", "WorkspaceId", "ParentId" },
                principalSchema: "finance",
                principalTable: "chart_accounts",
                principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_chart_accounts_chart_accounts_TenantId_WorkspaceId_ParentId",
                schema: "finance",
                table: "chart_accounts");

            migrationBuilder.DropTable(
                name: "chart_import_previews",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "mutation_audit",
                schema: "finance");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_chart_accounts_TenantId_WorkspaceId_Id",
                schema: "finance",
                table: "chart_accounts");

            migrationBuilder.DropIndex(
                name: "IX_chart_accounts_TenantId_WorkspaceId_ParentId",
                schema: "finance",
                table: "chart_accounts");

            migrationBuilder.DropColumn(
                name: "IsArchived",
                schema: "finance",
                table: "chart_accounts");

            migrationBuilder.DropColumn(
                name: "IsUsed",
                schema: "finance",
                table: "chart_accounts");

            migrationBuilder.DropColumn(
                name: "ParentId",
                schema: "finance",
                table: "chart_accounts");

            migrationBuilder.DropColumn(
                name: "Purpose",
                schema: "finance",
                table: "chart_accounts");

            migrationBuilder.DropColumn(
                name: "Version",
                schema: "finance",
                table: "chart_accounts");

            migrationBuilder.DropColumn(
                name: "ChartRevision",
                schema: "finance",
                table: "books");

            migrationBuilder.DropColumn(
                name: "HasAccountingActivity",
                schema: "finance",
                table: "books");
        }
    }
}
