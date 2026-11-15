using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class WorkspaceGovernance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "AuthorizationVersion",
                schema: "organization",
                table: "workspace_audit",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "TargetId",
                schema: "organization",
                table: "workspace_audit",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "user_accounts",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    VerifiedEmail = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_user_accounts", x => x.Id);
                    table.UniqueConstraint("AK_user_accounts_Issuer_Subject", x => new { x.Issuer, x.Subject });
                });

            migrationBuilder.CreateTable(
                name: "workspace_invitations",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    Role = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    InviterIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    InviterSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ExpiresAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    State = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    AcceptedSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_invitations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_workspace_invitations_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "organization",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "workspace_members",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Role = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    JoinedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_members", x => x.Id);
                    table.ForeignKey(
                        name: "FK_workspace_members_user_accounts_Issuer_Subject",
                        columns: x => new { x.Issuer, x.Subject },
                        principalSchema: "organization",
                        principalTable: "user_accounts",
                        principalColumns: new[] { "Issuer", "Subject" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_workspace_members_workspaces_WorkspaceId",
                        column: x => x.WorkspaceId,
                        principalSchema: "organization",
                        principalTable: "workspaces",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_workspace_invitations_WorkspaceId_OperationId",
                schema: "organization",
                table: "workspace_invitations",
                columns: new[] { "WorkspaceId", "OperationId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_workspace_members_Issuer_Subject",
                schema: "organization",
                table: "workspace_members",
                columns: new[] { "Issuer", "Subject" });

            migrationBuilder.CreateIndex(
                name: "IX_workspace_members_WorkspaceId_Issuer_Subject",
                schema: "organization",
                table: "workspace_members",
                columns: new[] { "WorkspaceId", "Issuer", "Subject" },
                unique: true);

            // Upgrade existing P1 workspaces without treating their historical creator as a perpetual authorization bypass.
            migrationBuilder.Sql("""
                INSERT INTO organization.user_accounts ("Id", "Issuer", "Subject", "IsActive")
                SELECT gen_random_uuid(), owners."OwnerIssuer", owners."OwnerSubject", TRUE
                FROM (SELECT DISTINCT "OwnerIssuer", "OwnerSubject" FROM organization.workspaces) owners;
                INSERT INTO organization.workspace_members ("Id", "WorkspaceId", "Issuer", "Subject", "Role", "IsActive", "JoinedAtUtc")
                SELECT gen_random_uuid(), "Id", "OwnerIssuer", "OwnerSubject", 'WorkspaceOwner', TRUE, "CreatedAtUtc"
                FROM organization.workspaces;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "workspace_invitations",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "workspace_members",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "user_accounts",
                schema: "organization");

            migrationBuilder.DropColumn(
                name: "AuthorizationVersion",
                schema: "organization",
                table: "workspace_audit");

            migrationBuilder.DropColumn(
                name: "TargetId",
                schema: "organization",
                table: "workspace_audit");
        }
    }
}
