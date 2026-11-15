using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Purchasing.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ReceiptPermitsAndProcesses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "TargetId",
                schema: "purchasing",
                table: "order_audit",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "receipt_permits",
                schema: "purchasing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    LineId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Executed = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Revision = table.Column<long>(type: "bigint", nullable: false),
                    Cancelling = table.Column<bool>(type: "boolean", nullable: false),
                    Fenced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_permits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_receipt_permits_orders_TenantId_WorkspaceId_OrderId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.OrderId },
                        principalSchema: "purchasing",
                        principalTable: "orders",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "receipt_processes",
                schema: "purchasing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_processes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_receipt_permits_TenantId_WorkspaceId_OrderId",
                schema: "purchasing",
                table: "receipt_permits",
                columns: new[] { "TenantId", "WorkspaceId", "OrderId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "receipt_permits",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "receipt_processes",
                schema: "purchasing");

            migrationBuilder.DropColumn(
                name: "TargetId",
                schema: "purchasing",
                table: "order_audit");
        }
    }
}
