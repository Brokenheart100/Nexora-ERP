using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddJournalLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "journal_links",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    FromJournalId = table.Column<Guid>(type: "uuid", nullable: false),
                    ToJournalId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<string>(type: "character varying(24)", maxLength: 24, nullable: false),
                    Memo = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    CreatedByIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedBySubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_journal_links", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_journal_links_TenantId_WorkspaceId_CreatedAtUtc",
                schema: "finance",
                table: "journal_links",
                columns: new[] { "TenantId", "WorkspaceId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_journal_links_TenantId_WorkspaceId_FromJournalId_ToJournalI~",
                schema: "finance",
                table: "journal_links",
                columns: new[] { "TenantId", "WorkspaceId", "FromJournalId", "ToJournalId", "Kind" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "journal_links",
                schema: "finance");
        }
    }
}
