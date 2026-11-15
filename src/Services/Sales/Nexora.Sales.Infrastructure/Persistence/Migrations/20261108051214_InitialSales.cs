using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Sales.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialSales : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "sales");

            migrationBuilder.CreateTable(
                name: "fulfillment_processes",
                schema: "sales",
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
                    table.PrimaryKey("PK_fulfillment_processes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "orders",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsQuote = table.Column<bool>(type: "boolean", nullable: false),
                    QuoteId = table.Column<Guid>(type: "uuid", nullable: true),
                    Number = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    MinorUnits = table.Column<int>(type: "integer", nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    CustomerId = table.Column<Guid>(type: "uuid", nullable: false),
                    CustomerCode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    CustomerName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    CustomerVersion = table.Column<long>(type: "bigint", nullable: false),
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
                name: "fulfillment_permits",
                schema: "sales",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    LineId = table.Column<Guid>(type: "uuid", nullable: false),
                    WarehouseId = table.Column<Guid>(type: "uuid", nullable: false),
                    Quantity = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Executed = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Revision = table.Column<long>(type: "bigint", nullable: false),
                    Cancelling = table.Column<bool>(type: "boolean", nullable: false),
                    Fenced = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fulfillment_permits", x => x.Id);
                    table.ForeignKey(
                        name: "FK_fulfillment_permits_orders_TenantId_WorkspaceId_OrderId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.OrderId },
                        principalSchema: "sales",
                        principalTable: "orders",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "order_audit",
                schema: "sales",
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
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    TargetId = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_order_audit", x => x.Id);
                    table.ForeignKey(
                        name: "FK_order_audit_orders_TenantId_WorkspaceId_OrderId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.OrderId },
                        principalSchema: "sales",
                        principalTable: "orders",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "order_lines",
                schema: "sales",
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
                        principalSchema: "sales",
                        principalTable: "orders",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_fulfillment_permits_TenantId_WorkspaceId_OrderId",
                schema: "sales",
                table: "fulfillment_permits",
                columns: new[] { "TenantId", "WorkspaceId", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_order_audit_TenantId_WorkspaceId_Issuer_Subject_OperationId",
                schema: "sales",
                table: "order_audit",
                columns: new[] { "TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_order_audit_TenantId_WorkspaceId_OrderId",
                schema: "sales",
                table: "order_audit",
                columns: new[] { "TenantId", "WorkspaceId", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_order_lines_TenantId_WorkspaceId_OrderId",
                schema: "sales",
                table: "order_lines",
                columns: new[] { "TenantId", "WorkspaceId", "OrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_TenantId_WorkspaceId_CreatedAtUtc",
                schema: "sales",
                table: "orders",
                columns: new[] { "TenantId", "WorkspaceId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_TenantId_WorkspaceId_MakerIssuer_MakerSubject_Create~",
                schema: "sales",
                table: "orders",
                columns: new[] { "TenantId", "WorkspaceId", "MakerIssuer", "MakerSubject", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_orders_TenantId_WorkspaceId_Number",
                schema: "sales",
                table: "orders",
                columns: new[] { "TenantId", "WorkspaceId", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_orders_TenantId_WorkspaceId_QuoteId",
                schema: "sales",
                table: "orders",
                columns: new[] { "TenantId", "WorkspaceId", "QuoteId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "fulfillment_permits",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "fulfillment_processes",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "order_audit",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "order_lines",
                schema: "sales");

            migrationBuilder.DropTable(
                name: "orders",
                schema: "sales");
        }
    }
}
