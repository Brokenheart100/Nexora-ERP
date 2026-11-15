using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Inventory.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SalesReservations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsSales",
                schema: "inventory",
                table: "stock_returns",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "Reserved",
                schema: "inventory",
                table: "cost_pools",
                type: "numeric(20,6)",
                precision: 20,
                scale: 6,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "sales_reservations",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Terms = table.Column<string>(type: "jsonb", nullable: false),
                    Executed = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Revision = table.Column<long>(type: "bigint", nullable: false),
                    Fenced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sales_reservations", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_sales_reservations_TenantId_WorkspaceId_WarehouseId",
                schema: "inventory",
                table: "sales_reservations",
                columns: new[] { "TenantId", "WorkspaceId", "WarehouseId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "sales_reservations",
                schema: "inventory");

            migrationBuilder.DropColumn(
                name: "IsSales",
                schema: "inventory",
                table: "stock_returns");

            migrationBuilder.DropColumn(
                name: "Reserved",
                schema: "inventory",
                table: "cost_pools");
        }
    }
}
