using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class BusinessRoleApprovals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string[]>(
                name: "ProposedBusinessRoles",
                schema: "organization",
                table: "workspace_members",
                type: "text[]",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ApproverMemberId",
                schema: "organization",
                table: "workspace_invitations",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string[]>(
                name: "BusinessRoles",
                schema: "organization",
                table: "workspace_invitations",
                type: "text[]",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProposedBusinessRoles",
                schema: "organization",
                table: "workspace_members");

            migrationBuilder.DropColumn(
                name: "ApproverMemberId",
                schema: "organization",
                table: "workspace_invitations");

            migrationBuilder.DropColumn(
                name: "BusinessRoles",
                schema: "organization",
                table: "workspace_invitations");
        }
    }
}
