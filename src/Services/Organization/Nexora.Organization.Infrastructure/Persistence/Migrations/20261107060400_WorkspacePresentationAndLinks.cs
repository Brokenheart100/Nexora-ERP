using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class WorkspacePresentationAndLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsPersonal",
                schema: "organization",
                table: "workspaces",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "workspace_navigation_links",
                schema: "organization",
                columns: table => new
                {
                    PersonalWorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CompanyWorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_navigation_links", x => new { x.PersonalWorkspaceId, x.CompanyWorkspaceId });
                    table.ForeignKey(
                        name: "FK_workspace_navigation_links_workspaces_CompanyWorkspaceId",
                        column: x => x.CompanyWorkspaceId,
                        principalSchema: "organization",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_workspace_navigation_links_workspaces_PersonalWorkspaceId",
                        column: x => x.PersonalWorkspaceId,
                        principalSchema: "organization",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "workspace_preferences",
                schema: "organization",
                columns: table => new
                {
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    LegalName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    BrandName = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    AccentColor = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: false),
                    DateFormat = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    TimeZone = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    LogoDataUrl = table.Column<string>(type: "character varying(175000)", maxLength: 175000, nullable: true),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_preferences", x => x.WorkspaceId);
                    table.ForeignKey(
                        name: "FK_workspace_preferences_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "organization",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_workspaces_OwnerIssuer_OwnerSubject",
                schema: "organization",
                table: "workspaces",
                columns: new[] { "OwnerIssuer", "OwnerSubject" },
                unique: true,
                filter: "\"IsPersonal\"");

            migrationBuilder.CreateIndex(
                name: "IX_workspace_navigation_links_CompanyWorkspaceId",
                schema: "organization",
                table: "workspace_navigation_links",
                column: "CompanyWorkspaceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "workspace_navigation_links",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "workspace_preferences",
                schema: "organization");

            migrationBuilder.DropIndex(
                name: "IX_workspaces_OwnerIssuer_OwnerSubject",
                schema: "organization",
                table: "workspaces");

            migrationBuilder.DropColumn(
                name: "IsPersonal",
                schema: "organization",
                table: "workspaces");
        }
    }
}
