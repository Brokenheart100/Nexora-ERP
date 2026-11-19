using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class TaxPeriodsAndFilings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "TaxCalendarVersion",
                schema: "finance",
                table: "books",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.AddColumn<int>(
                name: "TaxCycle",
                schema: "finance",
                table: "books",
                type: "integer",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<DateOnly>(
                name: "TaxLockedThrough",
                schema: "finance",
                table: "books",
                type: "date",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "tax_filings",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    From = table.Column<DateOnly>(type: "date", nullable: false),
                    Through = table.Column<DateOnly>(type: "date", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    CorrectsId = table.Column<Guid>(type: "uuid", nullable: true),
                    Reference = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Fingerprint = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    SnapshotJson = table.Column<string>(type: "jsonb", nullable: false),
                    FiledByIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    FiledBySubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    RecordedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    LockBooks = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tax_filings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_tax_filings_books_TenantId_WorkspaceId",
                        columns: x => new { x.TenantId, x.WorkspaceId },
                        principalSchema: "finance",
                        principalTable: "books",
                        principalColumns: new[] { "TenantId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_tax_filings_TenantId_WorkspaceId_From_Through_Version",
                schema: "finance",
                table: "tax_filings",
                columns: new[] { "TenantId", "WorkspaceId", "From", "Through", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tax_filings",
                schema: "finance");

            migrationBuilder.DropColumn(
                name: "TaxCalendarVersion",
                schema: "finance",
                table: "books");

            migrationBuilder.DropColumn(
                name: "TaxCycle",
                schema: "finance",
                table: "books");

            migrationBuilder.DropColumn(
                name: "TaxLockedThrough",
                schema: "finance",
                table: "books");
        }
    }
}
