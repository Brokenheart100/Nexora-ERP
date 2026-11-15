using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class FinancialClosingControls : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CashActivity",
                schema: "finance",
                table: "journals",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "bank_reconciliations",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    BankId = table.Column<Guid>(type: "uuid", nullable: false),
                    Through = table.Column<DateOnly>(type: "date", nullable: false),
                    StatementBalance = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Snapshot = table.Column<string>(type: "text", nullable: false),
                    MakerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    MakerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CompletedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UndoReason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    State = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bank_reconciliations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "fiscal_year_closings",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    First = table.Column<DateOnly>(type: "date", nullable: false),
                    Last = table.Column<DateOnly>(type: "date", nullable: false),
                    EquityAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Snapshot = table.Column<string>(type: "text", nullable: false),
                    MakerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    MakerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ClosingJournals = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    ReopeningJournals = table.Column<Guid[]>(type: "uuid[]", nullable: false),
                    ReopenReason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    State = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fiscal_year_closings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_bank_reconciliations_TenantId_WorkspaceId_BankId_Through",
                schema: "finance",
                table: "bank_reconciliations",
                columns: new[] { "TenantId", "WorkspaceId", "BankId", "Through" },
                unique: true,
                filter: "\"State\" = 2");

            migrationBuilder.CreateIndex(
                name: "IX_fiscal_year_closings_TenantId_WorkspaceId_First",
                schema: "finance",
                table: "fiscal_year_closings",
                columns: new[] { "TenantId", "WorkspaceId", "First" },
                unique: true,
                filter: "\"State\" = 2");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "bank_reconciliations",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "fiscal_year_closings",
                schema: "finance");

            migrationBuilder.DropColumn(
                name: "CashActivity",
                schema: "finance",
                table: "journals");
        }
    }
}
