using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class FinanceRoleApprovals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "FinanceRole",
                schema: "organization",
                table: "workspace_members",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FinanceRoleProposalExpiresAtUtc",
                schema: "organization",
                table: "workspace_members",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "FinanceRoleProposalVersion",
                schema: "organization",
                table: "workspace_members",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "FinanceRoleProposerId",
                schema: "organization",
                table: "workspace_members",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProposedFinanceRole",
                schema: "organization",
                table: "workspace_members",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FinanceRole",
                schema: "organization",
                table: "workspace_members");

            migrationBuilder.DropColumn(
                name: "FinanceRoleProposalExpiresAtUtc",
                schema: "organization",
                table: "workspace_members");

            migrationBuilder.DropColumn(
                name: "FinanceRoleProposalVersion",
                schema: "organization",
                table: "workspace_members");

            migrationBuilder.DropColumn(
                name: "FinanceRoleProposerId",
                schema: "organization",
                table: "workspace_members");

            migrationBuilder.DropColumn(
                name: "ProposedFinanceRole",
                schema: "organization",
                table: "workspace_members");
        }
    }
}
