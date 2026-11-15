using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SupplierTradeAndBanking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "bank_accounts",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Kind = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: false),
                    IsDefault = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Balance = table.Column<decimal>(type: "numeric(28,6)", precision: 28, scale: 6, nullable: false),
                    Entries = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bank_accounts", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "bank_import_previews",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    BankId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FileHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Entries = table.Column<string>(type: "jsonb", nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    CommittedCount = table.Column<int>(type: "integer", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bank_import_previews", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "bank_movements",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    BankId = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    JournalId = table.Column<Guid>(type: "uuid", nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Matched = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Voided = table.Column<bool>(type: "boolean", nullable: false),
                    ReversesId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bank_movements", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "receipt_accruals",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    Fact = table.Column<string>(type: "jsonb", nullable: false),
                    JournalId = table.Column<Guid>(type: "uuid", nullable: true),
                    Posted = table.Column<bool>(type: "boolean", nullable: false),
                    PendingReason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    AccrualAccountId = table.Column<Guid>(type: "uuid", nullable: true),
                    MatchedQuantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    MatchedCost = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    ReturnedQuantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    ReturnedCost = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    CreditedQuantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_accruals", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "statement_lines",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    BankId = table.Column<Guid>(type: "uuid", nullable: false),
                    BatchId = table.Column<Guid>(type: "uuid", nullable: false),
                    Row = table.Column<int>(type: "integer", nullable: false),
                    ExternalId = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Description = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Matched = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    Excluded = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_statement_lines", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "statement_matches",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    StatementLineId = table.Column<Guid>(type: "uuid", nullable: false),
                    MovementId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferenceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Reversed = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_statement_matches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "trade_documents",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Terms = table.Column<string>(type: "jsonb", nullable: false),
                    State = table.Column<int>(type: "integer", nullable: false),
                    MakerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    MakerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    JournalId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReversedById = table.Column<Guid>(type: "uuid", nullable: true),
                    Outstanding = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Total = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    PurchaseVariance = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    CreditedQuantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    CreditedNet = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    CreditedTax = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    PartnerVersion = table.Column<long>(type: "bigint", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_trade_documents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "trade_setup",
                schema: "finance",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    InventoryAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    AccrualAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    PayableAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    InputTaxAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    VarianceAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    DonationIncomeAccountId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_trade_setup", x => new { x.TenantId, x.WorkspaceId });
                });

            migrationBuilder.CreateIndex(
                name: "IX_bank_accounts_TenantId_WorkspaceId",
                schema: "finance",
                table: "bank_accounts",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_bank_accounts_TenantId_WorkspaceId_AccountId",
                schema: "finance",
                table: "bank_accounts",
                columns: new[] { "TenantId", "WorkspaceId", "AccountId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bank_accounts_TenantId_WorkspaceId_Code",
                schema: "finance",
                table: "bank_accounts",
                columns: new[] { "TenantId", "WorkspaceId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bank_import_previews_TenantId_WorkspaceId",
                schema: "finance",
                table: "bank_import_previews",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_bank_movements_TenantId_WorkspaceId",
                schema: "finance",
                table: "bank_movements",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_bank_movements_TenantId_WorkspaceId_BankId_On",
                schema: "finance",
                table: "bank_movements",
                columns: new[] { "TenantId", "WorkspaceId", "BankId", "On" });

            migrationBuilder.CreateIndex(
                name: "IX_bank_movements_TenantId_WorkspaceId_DocumentId",
                schema: "finance",
                table: "bank_movements",
                columns: new[] { "TenantId", "WorkspaceId", "DocumentId" });

            migrationBuilder.CreateIndex(
                name: "IX_receipt_accruals_TenantId_WorkspaceId",
                schema: "finance",
                table: "receipt_accruals",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_receipt_accruals_TenantId_WorkspaceId_WarehouseId_ItemId_Se~",
                schema: "finance",
                table: "receipt_accruals",
                columns: new[] { "TenantId", "WorkspaceId", "WarehouseId", "ItemId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_statement_lines_TenantId_WorkspaceId",
                schema: "finance",
                table: "statement_lines",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_statement_lines_TenantId_WorkspaceId_BankId_ExternalId",
                schema: "finance",
                table: "statement_lines",
                columns: new[] { "TenantId", "WorkspaceId", "BankId", "ExternalId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_statement_matches_TenantId_WorkspaceId",
                schema: "finance",
                table: "statement_matches",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_statement_matches_TenantId_WorkspaceId_StatementLineId",
                schema: "finance",
                table: "statement_matches",
                columns: new[] { "TenantId", "WorkspaceId", "StatementLineId" });

            migrationBuilder.CreateIndex(
                name: "IX_trade_documents_TenantId_WorkspaceId",
                schema: "finance",
                table: "trade_documents",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_trade_documents_TenantId_WorkspaceId_Number",
                schema: "finance",
                table: "trade_documents",
                columns: new[] { "TenantId", "WorkspaceId", "Number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "bank_accounts",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "bank_import_previews",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "bank_movements",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "receipt_accruals",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "statement_lines",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "statement_matches",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "trade_documents",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "trade_setup",
                schema: "finance");
        }
    }
}
