using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Organization.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialWorkspace : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "organization");

            migrationBuilder.CreateTable(
                name: "workspace_audit",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Action = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ActorIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    ActorSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_audit", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "workspaces",
                schema: "organization",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    OperationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    CountryCode = table.Column<string>(type: "character varying(2)", maxLength: 2, nullable: false),
                    BaseCurrency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    OwnerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    OwnerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspaces", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_workspaces_OwnerIssuer_OwnerSubject_OperationId",
                schema: "organization",
                table: "workspaces",
                columns: new[] { "OwnerIssuer", "OwnerSubject", "OperationId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "workspace_audit",
                schema: "organization");

            migrationBuilder.DropTable(
                name: "workspaces",
                schema: "organization");
        }
    }
}
