using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Purchasing.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialPurchasingOrders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "purchasing");

            migrationBuilder.CreateTable(
                name: "orders",
                schema: "purchasing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    MinorUnits = table.Column<int>(type: "integer", nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    SupplierId = table.Column<Guid>(type: "uuid", nullable: false),
                    SupplierCode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    SupplierName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    SupplierVersion = table.Column<long>(type: "bigint", nullable: false),
                    Note = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    MakerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    MakerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ApproverIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ApproverSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ApprovedVersion = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ApprovedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    State = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_orders", x => x.Id);
                    table.UniqueConstraint("AK_orders_TenantId_WorkspaceId_Id", x => new { x.TenantId, x.WorkspaceId, x.Id });
                });

            migrationBuilder.CreateTable(
                name: "order_audit",
                schema: "purchasing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ResultVersion = table.Column<long>(type: "bigint", nullable: false),
                    Reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_audit", x => x.Id);
                    table.ForeignKey(
                        name: "FK_order_audit_orders_TenantId_WorkspaceId_OrderId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.OrderId },
                        principalSchema: "purchasing",
                        principalTable: "orders",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "order_lines",
                schema: "purchasing",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ordinal = table.Column<int>(type: "integer", nullable: false),
                    ItemId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemCode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ItemName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    ItemVersion = table.Column<long>(type: "bigint", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    CategoryVersion = table.Column<long>(type: "bigint", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitCode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    UnitVersion = table.Column<long>(type: "bigint", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_lines", x => x.Id);
                    table.ForeignKey(
                        name: "FK_order_lines_orders_TenantId_WorkspaceId_OrderId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.OrderId },
                        principalSchema: "purchasing",
                        principalTable: "orders",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_order_audit_TenantId_WorkspaceId_Issuer_Subject_OperationId",
                schema: "purchasing",
                table: "order_audit",
                columns: new[] { "TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_order_audit_TenantId_WorkspaceId_OrderId",
                schema: "purchasing",
                table: "order_audit",
                columns: new[] { "TenantId", "WorkspaceId", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_order_lines_TenantId_WorkspaceId_OrderId",
                schema: "purchasing",
                table: "order_lines",
                columns: new[] { "TenantId", "WorkspaceId", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_TenantId_WorkspaceId_CreatedAtUtc",
                schema: "purchasing",
                table: "orders",
                columns: new[] { "TenantId", "WorkspaceId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_TenantId_WorkspaceId_MakerIssuer_MakerSubject_Create~",
                schema: "purchasing",
                table: "orders",
                columns: new[] { "TenantId", "WorkspaceId", "MakerIssuer", "MakerSubject", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_TenantId_WorkspaceId_Number",
                schema: "purchasing",
                table: "orders",
                columns: new[] { "TenantId", "WorkspaceId", "Number" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "order_audit",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "order_lines",
                schema: "purchasing");

            migrationBuilder.DropTable(
                name: "orders",
                schema: "purchasing");
        }
    }
}
