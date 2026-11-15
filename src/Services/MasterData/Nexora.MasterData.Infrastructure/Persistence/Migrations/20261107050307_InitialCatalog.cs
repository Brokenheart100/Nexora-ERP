using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.MasterData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCatalog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "masterdata");

            migrationBuilder.CreateTable(
                name: "definitions",
                schema: "masterdata",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_definitions", x => x.Id);
                    table.UniqueConstraint("AK_definitions_TenantId_WorkspaceId_Id", x => new { x.TenantId, x.WorkspaceId, x.Id });
                });

            migrationBuilder.CreateTable(
                name: "mutation_audit",
                schema: "masterdata",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ResourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ResourceVersion = table.Column<long>(type: "bigint", nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_mutation_audit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "items",
                schema: "masterdata",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    TracksInventory = table.Column<bool>(type: "boolean", nullable: false),
                    CategoryId = table.Column<Guid>(type: "uuid", nullable: false),
                    UnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_items", x => x.Id);
                    table.CheckConstraint("ck_items_kind_inventory", "(\"Kind\" = 1) OR (\"Kind\" = 2 AND NOT \"TracksInventory\")");
                    table.ForeignKey(
                        name: "FK_items_definitions_TenantId_WorkspaceId_CategoryId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.CategoryId },
                        principalSchema: "masterdata",
                        principalTable: "definitions",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_items_definitions_TenantId_WorkspaceId_UnitId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.UnitId },
                        principalSchema: "masterdata",
                        principalTable: "definitions",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_definitions_TenantId_WorkspaceId_Kind_Code",
                schema: "masterdata",
                table: "definitions",
                columns: new[] { "TenantId", "WorkspaceId", "Kind", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_items_TenantId_WorkspaceId_CategoryId",
                schema: "masterdata",
                table: "items",
                columns: new[] { "TenantId", "WorkspaceId", "CategoryId" });

            migrationBuilder.CreateIndex(
                name: "IX_items_TenantId_WorkspaceId_Code",
                schema: "masterdata",
                table: "items",
                columns: new[] { "TenantId", "WorkspaceId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_items_TenantId_WorkspaceId_UnitId",
                schema: "masterdata",
                table: "items",
                columns: new[] { "TenantId", "WorkspaceId", "UnitId" });

            migrationBuilder.CreateIndex(
                name: "IX_mutation_audit_TenantId_WorkspaceId_Issuer_Subject_Operatio~",
                schema: "masterdata",
                table: "mutation_audit",
                columns: new[] { "TenantId", "WorkspaceId", "Issuer", "Subject", "OperationId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "items",
                schema: "masterdata");

            migrationBuilder.DropTable(
                name: "mutation_audit",
                schema: "masterdata");

            migrationBuilder.DropTable(
                name: "definitions",
                schema: "masterdata");
        }
    }
}
