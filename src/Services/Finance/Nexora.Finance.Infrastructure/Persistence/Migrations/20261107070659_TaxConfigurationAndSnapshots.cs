using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TaxConfigurationAndSnapshots : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "tax_assessments",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    SnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tax_assessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tax_assessments_books_TenantId_WorkspaceId",
                        columns: x => new { x.TenantId, x.WorkspaceId },
                        principalSchema: "finance",
                        principalTable: "books",
                        principalColumns: new[] { "TenantId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "tax_classifications",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    ResourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    GroupCode = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    ReferenceVersion = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tax_classifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tax_classifications_books_TenantId_WorkspaceId",
                        columns: x => new { x.TenantId, x.WorkspaceId },
                        principalSchema: "finance",
                        principalTable: "books",
                        principalColumns: new[] { "TenantId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "tax_groups",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    RateCodes = table.Column<string>(type: "character varying(327)", maxLength: 327, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tax_groups", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tax_groups_books_TenantId_WorkspaceId",
                        columns: x => new { x.TenantId, x.WorkspaceId },
                        principalSchema: "finance",
                        principalTable: "books",
                        principalColumns: new[] { "TenantId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "tax_rates",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    EffectiveOn = table.Column<DateOnly>(type: "date", nullable: false),
                    Rate = table.Column<decimal>(type: "numeric(7,6)", precision: 7, scale: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tax_rates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tax_rates_books_TenantId_WorkspaceId",
                        columns: x => new { x.TenantId, x.WorkspaceId },
                        principalSchema: "finance",
                        principalTable: "books",
                        principalColumns: new[] { "TenantId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_tax_assessments_TenantId_WorkspaceId",
                schema: "finance",
                table: "tax_assessments",
                columns: new[] { "TenantId", "WorkspaceId" });

            migrationBuilder.CreateIndex(
                name: "IX_tax_classifications_TenantId_WorkspaceId_Kind_ResourceId_Ve~",
                schema: "finance",
                table: "tax_classifications",
                columns: new[] { "TenantId", "WorkspaceId", "Kind", "ResourceId", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tax_groups_TenantId_WorkspaceId_Code_Version",
                schema: "finance",
                table: "tax_groups",
                columns: new[] { "TenantId", "WorkspaceId", "Code", "Version" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_tax_rates_TenantId_WorkspaceId_Code_EffectiveOn",
                schema: "finance",
                table: "tax_rates",
                columns: new[] { "TenantId", "WorkspaceId", "Code", "EffectiveOn" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tax_assessments",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "tax_classifications",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "tax_groups",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "tax_rates",
                schema: "finance");
        }
    }
}
