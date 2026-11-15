using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class SalesExecutionRoles : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SalesRole",
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
                name: "SalesRole",
                schema: "organization",
                table: "workspace_members");
        }
    }
}
