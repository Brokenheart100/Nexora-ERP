using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRoleGrantPeriodsAndApprovals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ApprovalCount",
                schema: "organization",
                table: "workspace_role_grants",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateOnly>(
                name: "EndsOn",
                schema: "organization",
                table: "workspace_role_grants",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FirstApprovedBy",
                schema: "organization",
                table: "workspace_role_grants",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RequiredApprovals",
                schema: "organization",
                table: "workspace_role_grants",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<DateOnly>(
                name: "StartsOn",
                schema: "organization",
                table: "workspace_role_grants",
                type: "date",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RoleGrantApprovals",
                schema: "organization",
                table: "workspace_preferences",
                type: "integer",
                nullable: false,
                defaultValue: 1);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ApprovalCount",
                schema: "organization",
                table: "workspace_role_grants");

            migrationBuilder.DropColumn(
                name: "EndsOn",
                schema: "organization",
                table: "workspace_role_grants");

            migrationBuilder.DropColumn(
                name: "FirstApprovedBy",
                schema: "organization",
                table: "workspace_role_grants");

            migrationBuilder.DropColumn(
                name: "RequiredApprovals",
                schema: "organization",
                table: "workspace_role_grants");

            migrationBuilder.DropColumn(
                name: "StartsOn",
                schema: "organization",
                table: "workspace_role_grants");

            migrationBuilder.DropColumn(
                name: "RoleGrantApprovals",
                schema: "organization",
                table: "workspace_preferences");
        }
    }
}
