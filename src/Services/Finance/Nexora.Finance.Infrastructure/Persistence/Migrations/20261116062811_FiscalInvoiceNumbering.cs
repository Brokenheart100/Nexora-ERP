using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class FiscalInvoiceNumbering : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "NumberFiscalYear",
                schema: "finance",
                table: "customer_documents",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "NumberSequence",
                schema: "finance",
                table: "customer_documents",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "UsesFiscalNumber",
                schema: "finance",
                table: "customer_documents",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "InvoiceNumberPattern",
                schema: "finance",
                table: "books",
                type: "character varying(55)",
                maxLength: 55,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "InvoiceNumberStart",
                schema: "finance",
                table: "books",
                type: "bigint",
                nullable: false,
                defaultValue: 1L);

            migrationBuilder.AddColumn<long>(
                name: "InvoiceNumberVersion",
                schema: "finance",
                table: "books",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateIndex(
                name: "IX_customer_documents_TenantId_WorkspaceId_NumberFiscalYear_Nu~",
                schema: "finance",
                table: "customer_documents",
                columns: new[] { "TenantId", "WorkspaceId", "NumberFiscalYear", "NumberSequence" },
                unique: true,
                filter: "\"NumberSequence\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_customer_documents_TenantId_WorkspaceId_NumberFiscalYear_Nu~",
                schema: "finance",
                table: "customer_documents");

            migrationBuilder.DropColumn(
                name: "NumberFiscalYear",
                schema: "finance",
                table: "customer_documents");

            migrationBuilder.DropColumn(
                name: "NumberSequence",
                schema: "finance",
                table: "customer_documents");

            migrationBuilder.DropColumn(
                name: "UsesFiscalNumber",
                schema: "finance",
                table: "customer_documents");

            migrationBuilder.DropColumn(
                name: "InvoiceNumberPattern",
                schema: "finance",
                table: "books");

            migrationBuilder.DropColumn(
                name: "InvoiceNumberStart",
                schema: "finance",
                table: "books");

            migrationBuilder.DropColumn(
                name: "InvoiceNumberVersion",
                schema: "finance",
                table: "books");
        }
    }
}
