using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Inventory.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InventoryReceiptLedger : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "inventory");

            migrationBuilder.CreateTable(
                name: "cost_pools",
                schema: "inventory",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Value = table.Column<decimal>(type: "numeric(28,6)", precision: 28, scale: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_cost_pools", x => new { x.TenantId, x.WorkspaceId, x.WarehouseId, x.ItemId });
                });

            migrationBuilder.CreateTable(
                name: "operation_audit",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: false),
                    ResultVersion = table.Column<long>(type: "bigint", nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_operation_audit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "receipt_executions",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Terms = table.Column<string>(type: "jsonb", nullable: false),
                    Revision = table.Column<long>(type: "bigint", nullable: false),
                    Executed = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Cost = table.Column<decimal>(type: "numeric(28,6)", precision: 28, scale: 6, nullable: false),
                    Fenced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt_executions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "stock_movements",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    PermitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Cost = table.Column<decimal>(type: "numeric(28,6)", precision: 28, scale: 6, nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ReversesId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stock_movements", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "warehouses",
                schema: "inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    ReceiverId = table.Column<Guid>(type: "uuid", nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_warehouses", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_operation_audit_TenantId_WorkspaceId_Issuer_Subject_Operati~",
                schema: "inventory",
                table: "operation_audit",
                columns: new[] { "TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_receipt_executions_TenantId_WorkspaceId",
                schema: "inventory",
                table: "receipt_executions",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_TenantId_WorkspaceId_WarehouseId_ItemId_Seq~",
                schema: "inventory",
                table: "stock_movements",
                columns: new[] { "TenantId", "WorkspaceId", "WarehouseId", "ItemId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_warehouses_TenantId_WorkspaceId_Code",
                schema: "inventory",
                table: "warehouses",
                columns: new[] { "TenantId", "WorkspaceId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "cost_pools",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "operation_audit",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "receipt_executions",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "stock_movements",
                schema: "inventory");

            migrationBuilder.DropTable(
                name: "warehouses",
                schema: "inventory");
        }
    }
}
