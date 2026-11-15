using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CustomerReceivables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "InvoiceReserved",
                schema: "finance",
                table: "trade_documents",
                type: "numeric",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "InvoiceReserved",
                schema: "finance",
                table: "receipt_accruals",
                type: "numeric(20,6)",
                precision: 20,
                scale: 6,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "IsSales",
                schema: "finance",
                table: "receipt_accruals",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "customer_documents",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Terms = table.Column<string>(type: "jsonb", nullable: false),
                    Number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    MakerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    MakerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    State = table.Column<int>(type: "integer", nullable: false),
                    JournalId = table.Column<Guid>(type: "uuid", nullable: true),
                    OpenBalance = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_documents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "invoice_dispatches",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    JournalId = table.Column<Guid>(type: "uuid", nullable: false),
                    Recipient = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    PreviousId = table.Column<Guid>(type: "uuid", nullable: true),
                    ResentAsId = table.Column<Guid>(type: "uuid", nullable: true),
                    State = table.Column<int>(type: "integer", nullable: false),
                    Attempt = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LeaseUntilUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    Detail = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_invoice_dispatches", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "invoice_schedules",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Terms = table.Column<string>(type: "jsonb", nullable: false),
                    NextOn = table.Column<DateOnly>(type: "date", nullable: true),
                    LastOn = table.Column<DateOnly>(type: "date", nullable: true),
                    Paused = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    MakerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    MakerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    PendingReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_invoice_schedules", x => x.Id);
                    table.UniqueConstraint("AK_invoice_schedules_TenantId_WorkspaceId_Id", x => new { x.TenantId, x.WorkspaceId, x.Id });
                });

            migrationBuilder.CreateTable(
                name: "invoice_shares",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    JournalId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    RevokedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_invoice_shares", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "receivable_setup",
                schema: "finance",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Accounts = table.Column<string>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receivable_setup", x => new { x.TenantId, x.WorkspaceId });
                });

            migrationBuilder.CreateTable(
                name: "invoice_occurrences",
                schema: "finance",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ScheduleId = table.Column<Guid>(type: "uuid", nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    TemplateVersion = table.Column<long>(type: "bigint", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_invoice_occurrences", x => new { x.TenantId, x.WorkspaceId, x.ScheduleId, x.On });
                    table.ForeignKey(
                        name: "FK_invoice_occurrences_invoice_schedules_TenantId_WorkspaceId_~",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.ScheduleId },
                        principalSchema: "finance",
                        principalTable: "invoice_schedules",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_customer_documents_TenantId_WorkspaceId_Id",
                schema: "finance",
                table: "customer_documents",
                columns: new[] { "TenantId", "WorkspaceId", "Id" });

            migrationBuilder.CreateIndex(
                name: "IX_customer_documents_TenantId_WorkspaceId_Number",
                schema: "finance",
                table: "customer_documents",
                columns: new[] { "TenantId", "WorkspaceId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_invoice_dispatches_TenantId_WorkspaceId_InvoiceId",
                schema: "finance",
                table: "invoice_dispatches",
                columns: new[] { "TenantId", "WorkspaceId", "InvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_invoice_shares_TenantId_WorkspaceId_InvoiceId",
                schema: "finance",
                table: "invoice_shares",
                columns: new[] { "TenantId", "WorkspaceId", "InvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_invoice_shares_TokenHash",
                schema: "finance",
                table: "invoice_shares",
                column: "TokenHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "customer_documents",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "invoice_dispatches",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "invoice_occurrences",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "invoice_shares",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "receivable_setup",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "invoice_schedules",
                schema: "finance");

            migrationBuilder.DropColumn(
                name: "InvoiceReserved",
                schema: "finance",
                table: "trade_documents");

            migrationBuilder.DropColumn(
                name: "InvoiceReserved",
                schema: "finance",
                table: "receipt_accruals");

            migrationBuilder.DropColumn(
                name: "IsSales",
                schema: "finance",
                table: "receipt_accruals");
        }
    }
}
