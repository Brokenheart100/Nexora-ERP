using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SupplierReturnRecoveries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "SupplierRecoveryAccountId",
                schema: "finance",
                table: "trade_setup",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "CreditedPayable",
                schema: "finance",
                table: "trade_documents",
                type: "numeric(20,6)",
                precision: 20,
                scale: 6,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "Recoverable",
                schema: "finance",
                table: "trade_documents",
                type: "numeric(20,6)",
                precision: 20,
                scale: 6,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "RecoveryTotal",
                schema: "finance",
                table: "trade_documents",
                type: "numeric(20,6)",
                precision: 20,
                scale: 6,
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SupplierRecoveryAccountId",
                schema: "finance",
                table: "trade_setup");

            migrationBuilder.DropColumn(
                name: "CreditedPayable",
                schema: "finance",
                table: "trade_documents");

            migrationBuilder.DropColumn(
                name: "Recoverable",
                schema: "finance",
                table: "trade_documents");

            migrationBuilder.DropColumn(
                name: "RecoveryTotal",
                schema: "finance",
                table: "trade_documents");
        }
    }
}
