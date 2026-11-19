using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class DonationReceiptDeliveryAndLinks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsDonation",
                schema: "finance",
                table: "invoice_dispatches",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddUniqueConstraint(
                name: "AK_trade_documents_TenantId_WorkspaceId_Id",
                schema: "finance",
                table: "trade_documents",
                columns: new[] { "TenantId", "WorkspaceId", "Id" });

            migrationBuilder.CreateTable(
                name: "donation_fiscal_tickets",
                schema: "finance",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    WorkspaceId = table.Column<Guid>(type: "uuid", nullable: false),
                    DonationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Number = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    IssuedOn = table.Column<DateOnly>(type: "date", nullable: false),
                    LinkedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_donation_fiscal_tickets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_donation_fiscal_tickets_trade_documents_TenantId_WorkspaceI~",
                        columns: x => new { x.TenantId, x.WorkspaceId, x.DonationId },
                        principalSchema: "finance",
                        principalTable: "trade_documents",
                        principalColumns: new[] { "TenantId", "WorkspaceId", "Id" },
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_donation_fiscal_tickets_TenantId_WorkspaceId_Code_Number",
                schema: "finance",
                table: "donation_fiscal_tickets",
                columns: new[] { "TenantId", "WorkspaceId", "Code", "Number" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_donation_fiscal_tickets_TenantId_WorkspaceId_DonationId",
                schema: "finance",
                table: "donation_fiscal_tickets",
                columns: new[] { "TenantId", "WorkspaceId", "DonationId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "donation_fiscal_tickets",
                schema: "finance");

            migrationBuilder.DropUniqueConstraint(
                name: "AK_trade_documents_TenantId_WorkspaceId_Id",
                schema: "finance",
                table: "trade_documents");

            migrationBuilder.DropColumn(
                name: "IsDonation",
                schema: "finance",
                table: "invoice_dispatches");
        }
    }
}
