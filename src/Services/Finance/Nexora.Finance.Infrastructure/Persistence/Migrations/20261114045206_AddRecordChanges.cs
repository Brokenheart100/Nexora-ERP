using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddRecordChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "record_changes",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Service = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    EntityName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    EntityId = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Operation = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ActorIssuer = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    ActorSubject = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    ChangedProperties = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    BeforeJson = table.Column<string>(type: "text", nullable: true),
                    AfterJson = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_record_changes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_record_changes_TenantId_WorkspaceId_EntityName_EntityId",
                schema: "finance",
                table: "record_changes",
                columns: new[] { "TenantId", "WorkspaceId", "EntityName", "EntityId" });

            migrationBuilder.CreateIndex(
                name: "IX_record_changes_TenantId_WorkspaceId_OccurredAtUtc",
                schema: "finance",
                table: "record_changes",
                columns: new[] { "TenantId", "WorkspaceId", "OccurredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_record_changes_TenantId_WorkspaceId_Operation",
                schema: "finance",
                table: "record_changes",
                columns: new[] { "TenantId", "WorkspaceId", "Operation" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "record_changes",
                schema: "finance");
        }
    }
}
