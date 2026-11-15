using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Reporting.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialProjection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "reporting");

            migrationBuilder.CreateTable(
                name: "workspace_projection",
                schema: "reporting",
                columns: table => new
                {
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    CountryCode = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    BaseCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    LastEventId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProjectedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_projection", x => x.WorkspaceId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_workspace_projection_LastEventId",
                schema: "reporting",
                table: "workspace_projection",
                column: "LastEventId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "workspace_projection",
                schema: "reporting");
        }
    }
}
