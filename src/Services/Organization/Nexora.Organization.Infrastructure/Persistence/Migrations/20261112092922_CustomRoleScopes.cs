using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CustomRoleScopes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "workspace_custom_roles",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    Permissions = table.Column<string[]>(type: "text[]", nullable: false),
                    Revision = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_custom_roles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_workspace_custom_roles_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "organization",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "workspace_departments",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_departments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_workspace_departments_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "organization",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "workspace_role_grants",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    MemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
                    RoleRevision = table.Column<long>(type: "bigint", nullable: false),
                    Permissions = table.Column<string[]>(type: "text[]", nullable: false),
                    Scope = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ScopeId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequestedBy = table.Column<Guid>(type: "uuid", nullable: false),
                    ApprovedBy = table.Column<Guid>(type: "uuid", nullable: true),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_role_grants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_workspace_role_grants_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "organization",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_workspace_custom_roles_WorkspaceId",
                schema: "organization",
                table: "workspace_custom_roles",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_workspace_departments_WorkspaceId",
                schema: "organization",
                table: "workspace_departments",
                column: "WorkspaceId");

            migrationBuilder.CreateIndex(
                name: "IX_workspace_role_grants_WorkspaceId",
                schema: "organization",
                table: "workspace_role_grants",
                column: "WorkspaceId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "workspace_custom_roles",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "workspace_departments",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "workspace_role_grants",
                schema: "organization");
        }
    }
}
