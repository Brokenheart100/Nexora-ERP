using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.MasterData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BusinessPartners : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "partners",
                schema: "masterdata",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    TaxNumber = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    Address = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Roles = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_partners", x => x.Id);
                    table.CheckConstraint("ck_partners_roles", "\"Roles\" BETWEEN 1 AND 7");
                });

            migrationBuilder.CreateTable(
                name: "partner_contacts",
                schema: "masterdata",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PartnerId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    Phone = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_partner_contacts", x => new { x.PartnerId, x.Id });
                    table.ForeignKey(
                        name: "FK_partner_contacts_partners_PartnerId",
                        column: x => x.PartnerId,
                        principalSchema: "masterdata",
                        principalTable: "partners",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_partners_TenantId_WorkspaceId_Code",
                schema: "masterdata",
                table: "partners",
                columns: new[] { "TenantId", "WorkspaceId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "partner_contacts",
                schema: "masterdata");

            migrationBuilder.DropTable(
                name: "partners",
                schema: "masterdata");
        }
    }
}
