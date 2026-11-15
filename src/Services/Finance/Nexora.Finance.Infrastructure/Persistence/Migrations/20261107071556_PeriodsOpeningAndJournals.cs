using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class PeriodsOpeningAndJournals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<long>(
                name: "LastPostingNumber",
                schema: "finance",
                table: "books",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateTable(
                name: "fiscal_periods",
                schema: "finance",
                columns: table => new
                {
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Month = table.Column<DateOnly>(type: "date", nullable: false),
                    State = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    ClosingWatermark = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fiscal_periods", x => new { x.TenantId, x.WorkspaceId, x.Month });
                    table.ForeignKey(
                        name: "FK_fiscal_periods_books_TenantId_WorkspaceId",
                        columns: x => new { x.TenantId, x.WorkspaceId },
                        principalSchema: "finance",
                        principalTable: "books",
                        principalColumns: new[] { "TenantId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "journals",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Kind = table.Column<int>(type: "integer", nullable: false),
                    SourceKey = table.Column<string>(type: "character varying(87)", maxLength: 87, nullable: false),
                    SourceNumber = table.Column<string>(type: "character varying(80)", maxLength: 80, nullable: false),
                    ReversesId = table.Column<Guid>(type: "uuid", nullable: true),
                    MakerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    MakerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ReviewerIssuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    ReviewerSubject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ApprovedVersion = table.Column<long>(type: "bigint", nullable: true),
                    State = table.Column<int>(type: "integer", nullable: false),
                    On = table.Column<DateOnly>(type: "date", nullable: false),
                    Memo = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    PostingNumber = table.Column<long>(type: "bigint", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    PostedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_journals", x => x.Id);
                    table.UniqueConstraint("AK_journals_TenantId_WorkspaceId_Id", x => new { x.TenantId, x.WorkspaceId, x.Id });
                    table.ForeignKey(
                        name: "FK_journals_books_TenantId_WorkspaceId",
                        columns: x => new { x.TenantId, x.WorkspaceId },
                        principalSchema: "finance",
                        principalTable: "books",
                        principalColumns: new[] { "TenantId", "WorkspaceId" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_journals_journals_TenantId_WorkspaceId_ReversesId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.ReversesId },
                        principalSchema: "finance",
                        principalTable: "journals",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "period_transitions",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Month = table.Column<DateOnly>(type: "date", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    State = table.Column<int>(type: "integer", nullable: false),
                    Watermark = table.Column<long>(type: "bigint", nullable: true),
                    Reason = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Issuer = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Subject = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_period_transitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_period_transitions_fiscal_periods_TenantId_WorkspaceId_Month",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.Month },
                        principalSchema: "finance",
                        principalTable: "fiscal_periods",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Month" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "journal_lines",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    JournalId = table.Column<Guid>(type: "uuid", nullable: false),
                    Ordinal = table.Column<int>(type: "integer", nullable: false),
                    AccountId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Name = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Debit = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false),
                    Credit = table.Column<decimal>(type: "numeric(20,6)", precision: 20, scale: 6, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_journal_lines", x => x.Id);
                    table.CheckConstraint("ck_journal_line_amounts", "(\"Debit\" > 0 AND \"Credit\" = 0) OR (\"Credit\" > 0 AND \"Debit\" = 0)");
                    table.ForeignKey(
                        name: "FK_journal_lines_chart_accounts_TenantId_WorkspaceId_AccountId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.AccountId },
                        principalSchema: "finance",
                        principalTable: "chart_accounts",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_journal_lines_journals_TenantId_WorkspaceId_JournalId",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.JournalId },
                        principalSchema: "finance",
                        principalTable: "journals",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_journal_lines_TenantId_WorkspaceId_AccountId",
                schema: "finance",
                table: "journal_lines",
                columns: new[] { "TenantId", "WorkspaceId", "AccountId" });

            migrationBuilder.CreateIndex(
                name: "IX_journal_lines_TenantId_WorkspaceId_JournalId",
                schema: "finance",
                table: "journal_lines",
                columns: new[] { "TenantId", "WorkspaceId", "JournalId" });

            migrationBuilder.CreateIndex(
                name: "IX_journals_TenantId_WorkspaceId_On",
                schema: "finance",
                table: "journals",
                columns: new[] { "TenantId", "WorkspaceId", "On" });

            migrationBuilder.CreateIndex(
                name: "IX_journals_TenantId_WorkspaceId_PostingNumber",
                schema: "finance",
                table: "journals",
                columns: new[] { "TenantId", "WorkspaceId", "PostingNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_journals_TenantId_WorkspaceId_ReversesId",
                schema: "finance",
                table: "journals",
                columns: new[] { "TenantId", "WorkspaceId", "ReversesId" });

            migrationBuilder.CreateIndex(
                name: "IX_journals_TenantId_WorkspaceId_SourceKey",
                schema: "finance",
                table: "journals",
                columns: new[] { "TenantId", "WorkspaceId", "SourceKey" },
                unique: true,
                filter: "\"State\" <> 4");

            migrationBuilder.CreateIndex(
                name: "IX_period_transitions_TenantId_WorkspaceId_Month_Version",
                schema: "finance",
                table: "period_transitions",
                columns: new[] { "TenantId", "WorkspaceId", "Month", "Version" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "journal_lines",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "period_transitions",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "journals",
                schema: "finance");

            migrationBuilder.DropTable(
                name: "fiscal_periods",
                schema: "finance");

            migrationBuilder.DropColumn(
                name: "LastPostingNumber",
                schema: "finance",
                table: "books");
        }
    }
}
