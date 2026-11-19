using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class OpeningSubledgerCutover : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "opening_subledger_batches",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    EquityAccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    FileHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Maker = table.Column<string>(type: "jsonb", nullable: false),
                    Reviewer = table.Column<string>(type: "jsonb", nullable: true),
                    Rows = table.Column<string>(type: "jsonb", nullable: false),
                    Postings = table.Column<string>(type: "jsonb", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    State = table.Column<int>(type: "integer", nullable: false),
                    Rejection = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_opening_subledger_batches", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_opening_subledger_batches_TenantId_WorkspaceId",
                schema: "finance",
                table: "opening_subledger_batches",
                columns: new[] { "TenantId", "WorkspaceId" },
                unique: true,
                filter: "\"State\" IN (0, 1, 2)");

            migrationBuilder.CreateIndex(
                name: "IX_opening_subledger_batches_TenantId_WorkspaceId_Id",
                schema: "finance",
                table: "opening_subledger_batches",
                columns: new[] { "TenantId", "WorkspaceId", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "opening_subledger_batches",
                schema: "finance");
        }
    }
}
