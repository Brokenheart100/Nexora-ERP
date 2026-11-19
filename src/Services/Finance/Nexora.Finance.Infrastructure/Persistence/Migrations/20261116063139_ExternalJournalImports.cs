using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class ExternalJournalImports : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ExternalId",
                schema: "finance",
                table: "journals",
                type: "character varying(80)",
                maxLength: 80,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ImportProvider",
                schema: "finance",
                table: "journals",
                type: "character varying(40)",
                maxLength: 40,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_journals_TenantId_WorkspaceId_ImportProvider_ExternalId",
                schema: "finance",
                table: "journals",
                columns: new[] { "TenantId", "WorkspaceId", "ImportProvider", "ExternalId" },
                unique: true,
                filter: "\"ImportProvider\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_journals_TenantId_WorkspaceId_ImportProvider_ExternalId",
                schema: "finance",
                table: "journals");

            migrationBuilder.DropColumn(
                name: "ExternalId",
                schema: "finance",
                table: "journals");

            migrationBuilder.DropColumn(
                name: "ImportProvider",
                schema: "finance",
                table: "journals");
        }
    }
}
