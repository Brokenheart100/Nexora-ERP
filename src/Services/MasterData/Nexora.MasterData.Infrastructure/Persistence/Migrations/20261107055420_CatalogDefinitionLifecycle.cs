using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.MasterData.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class CatalogDefinitionLifecycle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsActive",
                schema: "masterdata",
                table: "definitions",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<long>(
                name: "Version",
                schema: "masterdata",
                table: "definitions",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsActive",
                schema: "masterdata",
                table: "definitions");

            migrationBuilder.DropColumn(
                name: "Version",
                schema: "masterdata",
                table: "definitions");
        }
    }
}
