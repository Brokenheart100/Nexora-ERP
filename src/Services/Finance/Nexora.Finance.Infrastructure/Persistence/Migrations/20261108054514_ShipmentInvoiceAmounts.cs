using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Finance.Infrastructure.Persistence.Migrations;

public partial class ShipmentInvoiceAmounts : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "InvoiceReserved", schema: "finance", table: "trade_documents");
        migrationBuilder.AddColumn<decimal>(name: "InvoicePostedNet", schema: "finance", table: "receipt_accruals",
            type: "numeric(20,6)", precision: 20, scale: 6, nullable: false, defaultValue: 0m);
        migrationBuilder.AddColumn<decimal>(name: "InvoiceReservedNet", schema: "finance", table: "receipt_accruals",
            type: "numeric(20,6)", precision: 20, scale: 6, nullable: false, defaultValue: 0m);

        migrationBuilder.Sql("""
            WITH totals AS (
                SELECT d."TenantId", d."WorkspaceId", (line->>'ShipmentId')::uuid AS shipment,
                    COALESCE(SUM((line->>'Net')::numeric) FILTER (WHERE d."State" = 1), 0) AS reserved,
                    COALESCE(SUM((line->>'Net')::numeric) FILTER (WHERE d."State" = 2), 0) AS posted
                FROM finance.customer_documents d
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE WHEN jsonb_typeof(d."Terms"->'Lines') = 'array' THEN d."Terms"->'Lines' ELSE '[]'::jsonb END
                ) AS line
                WHERE d."Terms"->>'Kind' = '1' AND d."State" IN (1, 2) AND line->>'ShipmentId' IS NOT NULL
                GROUP BY d."TenantId", d."WorkspaceId", (line->>'ShipmentId')::uuid
            )
            UPDATE finance.receipt_accruals a
            SET "InvoiceReservedNet" = t.reserved, "InvoicePostedNet" = t.posted
            FROM totals t
            WHERE a."TenantId" = t."TenantId" AND a."WorkspaceId" = t."WorkspaceId" AND a."Id" = t.shipment AND a."IsSales";
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(name: "InvoicePostedNet", schema: "finance", table: "receipt_accruals");
        migrationBuilder.DropColumn(name: "InvoiceReservedNet", schema: "finance", table: "receipt_accruals");
        migrationBuilder.AddColumn<decimal>(name: "InvoiceReserved", schema: "finance", table: "trade_documents",
            type: "numeric", nullable: false, defaultValue: 0m);
    }
}
