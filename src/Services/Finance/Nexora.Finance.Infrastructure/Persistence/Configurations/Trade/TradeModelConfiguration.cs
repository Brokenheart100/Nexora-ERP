using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class TradeModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var setup = model.Entity<TradeSetup>();
        setup.ToTable("trade_setup");
        setup.HasKey(x => new { x.TenantId, x.WorkspaceId });

        var docs = model.Entity<TradeDocument>();
        ConfigureScoped(docs, "trade_documents");
        docs.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Number }).IsUnique();
        docs.Property(x => x.Number).HasMaxLength(60);
        docs.Property(x => x.MakerIssuer).HasMaxLength(500);
        docs.Property(x => x.MakerSubject).HasMaxLength(200);
        docs.Property(x => x.Outstanding).HasPrecision(20, 6);
        docs.Property(x => x.Total).HasPrecision(20, 6);
        docs.Property(x => x.PurchaseVariance).HasPrecision(20, 6);
        docs.Property(x => x.CreditedQuantity).HasPrecision(20, 6);
        docs.Property(x => x.CreditedNet).HasPrecision(20, 6);
        docs.Property(x => x.CreditedTax).HasPrecision(20, 6);
        docs.Property(x => x.CreditedPayable).HasPrecision(20, 6);
        docs.Property(x => x.Recoverable).HasPrecision(20, 6);
        docs.Property(x => x.RecoveryTotal).HasPrecision(20, 6);
        docs.Ignore(x => x.BillMatches);
        docs.Property<BillReceiptMatch[]?>("_billMatches").HasColumnName("BillMatches")
            .HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
                x => JsonSerializer.Deserialize<BillReceiptMatch[]>(x, (JsonSerializerOptions?)null))
            .HasColumnType("jsonb").Metadata.SetValueComparer(new ValueComparer<BillReceiptMatch[]?>(
                (left, right) => left == null ? right == null : right != null && left.SequenceEqual(right),
                rows => rows == null ? 0 : rows.Aggregate(0, (hash, row) => HashCode.Combine(hash, row)),
                rows => rows == null ? null : rows.ToArray()));
        docs.Property(x => x.Terms).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<TradeTerms>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb");

        var banks = model.Entity<BankAccount>();
        ConfigureScoped(banks, "bank_accounts");
        banks.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Code }).IsUnique();
        banks.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.AccountId }).IsUnique();
        banks.Property(x => x.Code).HasMaxLength(40);
        banks.Property(x => x.Name).HasMaxLength(160);
        banks.Property(x => x.Kind).HasMaxLength(4);
        banks.Property(x => x.Balance).HasPrecision(28, 6);

        var movements = model.Entity<BankMovement>();
        ConfigureScoped(movements, "bank_movements");
        movements.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.BankId, x.On });
        movements.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.DocumentId });
        movements.Property(x => x.Amount).HasPrecision(20, 6);
        movements.Property(x => x.Matched).HasPrecision(20, 6);

        var receipts = model.Entity<ReceiptAccrual>();
        ConfigureScoped(receipts, "receipt_accruals");
        receipts.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.WarehouseId, x.ItemId, x.Sequence }).IsUnique();
        receipts.Property(x => x.PendingReason).HasMaxLength(300);
        receipts.Property(x => x.MatchedCost).HasPrecision(20, 6);
        receipts.Property(x => x.MatchedQuantity).HasPrecision(20, 6);
        receipts.Property(x => x.ReturnedQuantity).HasPrecision(20, 6);
        receipts.Property(x => x.ReturnedCost).HasPrecision(20, 6);
        receipts.Property(x => x.CreditedQuantity).HasPrecision(20, 6);
        receipts.Property(x => x.InvoiceReserved).HasPrecision(20, 6);
        receipts.Property(x => x.InvoiceReservedNet).HasPrecision(20, 6);
        receipts.Property(x => x.InvoicePostedNet).HasPrecision(20, 6);
        receipts.Property(x => x.Fact).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<ReceiptFact>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb");

        var previews = model.Entity<BankImportPreview>();
        ConfigureScoped(previews, "bank_import_previews");
        previews.Property(x => x.Issuer).HasMaxLength(500);
        previews.Property(x => x.Subject).HasMaxLength(200);
        previews.Property(x => x.FileHash).HasMaxLength(64);
        previews.Property(x => x.Entries).HasColumnType("jsonb");

        var lines = model.Entity<StatementLine>();
        ConfigureScoped(lines, "statement_lines");
        lines.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.BankId, x.ExternalId }).IsUnique();
        lines.Property(x => x.ExternalId).HasMaxLength(120);
        lines.Property(x => x.Description).HasMaxLength(300);
        lines.Property(x => x.Amount).HasPrecision(20, 6);
        lines.Property(x => x.Matched).HasPrecision(20, 6);

        var matches = model.Entity<StatementMatch>();
        ConfigureScoped(matches, "statement_matches");
        matches.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.StatementLineId });
        matches.Property(x => x.Amount).HasPrecision(20, 6);
    }

    private static void ConfigureScoped<T>(EntityTypeBuilder<T> entity, string table) where T : class
    {
        entity.ToTable(table);
        entity.Property<Guid>("Id").ValueGeneratedNever();
        entity.HasIndex("TenantId", "WorkspaceId");
    }
}
