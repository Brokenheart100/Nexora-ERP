using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class LocalBillingCheckout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "HasSavedTestCard",
                schema: "organization",
                table: "billing_subscriptions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CheckoutPeriodEndUtc",
                schema: "organization",
                table: "billing_invoices",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "CheckoutSubscriptionVersion",
                schema: "organization",
                table: "billing_invoices",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "UsesSavedTestCard",
                schema: "organization",
                table: "billing_invoices",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HasSavedTestCard",
                schema: "organization",
                table: "billing_subscriptions");

            migrationBuilder.DropColumn(
                name: "CheckoutPeriodEndUtc",
                schema: "organization",
                table: "billing_invoices");

            migrationBuilder.DropColumn(
                name: "CheckoutSubscriptionVersion",
                schema: "organization",
                table: "billing_invoices");

            migrationBuilder.DropColumn(
                name: "UsesSavedTestCard",
                schema: "organization",
                table: "billing_invoices");
        }
    }
}
