using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class MultiReceiptSupplierBills : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BillMatches",
                schema: "finance",
                table: "trade_documents",
                type: "jsonb",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BillMatches",
                schema: "finance",
                table: "trade_documents");
        }
    }
}
