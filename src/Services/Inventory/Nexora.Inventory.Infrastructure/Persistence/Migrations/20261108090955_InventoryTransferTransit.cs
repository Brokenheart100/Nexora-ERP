using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Inventory.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InventoryTransferTransit : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateOnly>(
                name: "ReceivedOn",
                schema: "inventory",
                table: "stock_operations",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TransitCost",
                schema: "inventory",
                table: "stock_operations",
                type: "numeric(20,6)",
                precision: 20,
                scale: 6,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReceivedOn",
                schema: "inventory",
                table: "stock_operations");

            migrationBuilder.DropColumn(
                name: "TransitCost",
                schema: "inventory",
                table: "stock_operations");
        }
    }
}
