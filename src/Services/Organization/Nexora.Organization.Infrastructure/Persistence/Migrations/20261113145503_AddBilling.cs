using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBilling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "billing_document_usage",
                schema: "organization",
                columns: table => new
                {
                    BillingAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    PeriodMonth = table.Column<DateOnly>(type: "date", nullable: false),
                    Documents = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_document_usage", x => new { x.BillingAccountId, x.PeriodMonth });
                });

            migrationBuilder.CreateTable(
                name: "billing_invoices",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BillingAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanCode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AmountCents = table.Column<int>(type: "integer", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    PaymentReference = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: true),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentOperationId = table.Column<Guid>(type: "uuid", nullable: true),
                    IssuedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PaidAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_invoices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "billing_subscriptions",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    PlanCode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    PeriodStartUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    PeriodEndUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_subscriptions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "billing_usage_reservations",
                schema: "organization",
                columns: table => new
                {
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    BillingAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    PeriodMonth = table.Column<DateOnly>(type: "date", nullable: false),
                    Count = table.Column<int>(type: "integer", nullable: false),
                    RecordedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_billing_usage_reservations", x => x.OperationId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_billing_invoices_BillingAccountId_IssuedAtUtc",
                schema: "organization",
                table: "billing_invoices",
                columns: new[] { "BillingAccountId", "IssuedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_billing_invoices_OperationId",
                schema: "organization",
                table: "billing_invoices",
                column: "OperationId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_billing_invoices_PaymentOperationId",
                schema: "organization",
                table: "billing_invoices",
                column: "PaymentOperationId",
                unique: true,
                filter: "\"PaymentOperationId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_billing_subscriptions_Issuer_Subject",
                schema: "organization",
                table: "billing_subscriptions",
                columns: new[] { "Issuer", "Subject" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "billing_document_usage",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "billing_invoices",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "billing_subscriptions",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "billing_usage_reservations",
                schema: "organization");
        }
    }
}
