using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Inventory.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InventoryStockOperations : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "stock_operations",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    DestinationId = table.Column<Guid>(type: "uuid", nullable: true),
                    MakerId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReviewerId = table.Column<Guid>(type: "uuid", nullable: true),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    ExpectedSequence = table.Column<long>(type: "bigint", nullable: false),
                    BookQuantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    MovementId = table.Column<Guid>(type: "uuid", nullable: true),
                    DestinationMovementId = table.Column<Guid>(type: "uuid", nullable: true),
                    Cancelled = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_operations", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_stock_operations_TenantId_WorkspaceId_DestinationId",
                schema: "inventory",
                table: "stock_operations",
                columns: new[] { "TenantId", "WorkspaceId", "DestinationId" });

            migrationBuilder.CreateIndex(
                name: "IX_stock_operations_TenantId_WorkspaceId_WarehouseId",
                schema: "inventory",
                table: "stock_operations",
                columns: new[] { "TenantId", "WorkspaceId", "WarehouseId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "stock_operations",
                schema: "inventory");
        }
    }
}
