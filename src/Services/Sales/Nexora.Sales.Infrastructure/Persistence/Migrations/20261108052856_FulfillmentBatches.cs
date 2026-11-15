using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexora.Sales.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class FulfillmentBatches : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "BatchId",
                schema: "sales",
                table: "fulfillment_permits",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BatchId",
                schema: "sales",
                table: "fulfillment_permits");
        }
    }
}
