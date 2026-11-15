using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialAccountingBook : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "finance");

            migrationBuilder.CreateTable(
                name: "books",
                schema: "finance",
                columns: table => new
                {
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsPersonal = table.Column<bool>(type: "boolean", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    BaseCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    StartsOn = table.Column<DateOnly>(type: "date", nullable: false),
                    FiscalYearStartMonth = table.Column<int>(type: "integer", nullable: false),
                    InitializedByIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    InitializedBySubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    InitializedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_books", x => x.WorkspaceId);
                    table.UniqueConstraint("AK_books_TenantId_WorkspaceId", x => new { x.TenantId, x.WorkspaceId });
                });

            migrationBuilder.CreateTable(
                name: "chart_accounts",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Category = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_chart_accounts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_chart_accounts_books_TenantId_WorkspaceId",
                        columns: x => new { x.TenantId, x.WorkspaceId },
                        principalSchema: "finance",
                        principalTable: "books",
                        principalColumns: new[] { "TenantId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_chart_accounts_TenantId_WorkspaceId_Code",
                schema: "finance",
                table: "chart_accounts",
                columns: new[] { "TenantId", "WorkspaceId", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "chart_accounts",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "books",
                schema: "finance");
        }
    }
}
