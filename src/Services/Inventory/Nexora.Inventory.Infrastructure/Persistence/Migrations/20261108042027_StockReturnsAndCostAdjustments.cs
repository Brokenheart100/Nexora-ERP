using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Inventory.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StockReturnsAndCostAdjustments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Reason",
                schema: "inventory",
                table: "stock_movements",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "stock_returns",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    OriginalId = table.Column<Guid>(type: "uuid", nullable: false),
                    ApproverId = table.Column<Guid>(type: "uuid", nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    MovementId = table.Column<Guid>(type: "uuid", nullable: true),
                    Cancelled = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_returns", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_stock_returns_TenantId_WorkspaceId_OriginalId",
                schema: "inventory",
                table: "stock_returns",
                columns: new[] { "TenantId", "WorkspaceId", "OriginalId" });

            migrationBuilder.CreateIndex(
                name: "IX_stock_returns_TenantId_WorkspaceId_WarehouseId",
                schema: "inventory",
                table: "stock_returns",
                columns: new[] { "TenantId", "WorkspaceId", "WarehouseId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_returns",
                schema: "inventory");

            migrationBuilder.DropColumn(
                name: "Reason",
                schema: "inventory",
                table: "stock_movements");
        }
    }
}
