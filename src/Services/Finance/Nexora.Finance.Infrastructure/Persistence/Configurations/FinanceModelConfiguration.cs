using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class FinanceModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        model.HasDefaultSchema("finance");
        TaxModelConfiguration.Configure(model);
        LedgerModelConfiguration.Configure(model);
        TradeModelConfiguration.Configure(model);
        ReconciliationModelConfiguration.Configure(model);
        FiscalYearModelConfiguration.Configure(model);
        ReportExportModelConfiguration.Configure(model);
        ReceivableModelConfiguration.Configure(model);
        RecurringModelConfiguration.Configure(model);
        InvoiceShareModelConfiguration.Configure(model);
        InvoiceDispatchModelConfiguration.Configure(model);
        var books = model.Entity<AccountingBook>();
        books.ToTable("books");
        books.HasKey(x => x.WorkspaceId);
        books.HasAlternateKey(x => new { x.TenantId, x.WorkspaceId });
        books.Property(x => x.BaseCurrency).HasMaxLength(3);
        books.Property(x => x.InitializedByIssuer).HasMaxLength(500);
        books.Property(x => x.InitializedBySubject).HasMaxLength(200);
        books.Property(x => x.ChartRevision).HasDefaultValue(1L);
        var accounts = model.Entity<ChartAccount>();
        accounts.ToTable("chart_accounts");
        accounts.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Code }).IsUnique();
        accounts.Property(x => x.Code).HasMaxLength(40);
        accounts.Property(x => x.Name).HasMaxLength(160);
        accounts.Property(x => x.Purpose).HasDefaultValue(AccountPurpose.Posting);
        accounts.Property(x => x.Version).HasDefaultValue(1L).IsConcurrencyToken();
        accounts.HasAlternateKey(x => new { x.TenantId, x.WorkspaceId, x.Id });
        accounts.HasOne<ChartAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.ParentId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        accounts.HasOne<AccountingBook>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);

        var previews = model.Entity<ChartImportPreview>();
        previews.ToTable("chart_import_previews");
        previews.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.ExpiresAtUtc });
        previews.Property(x => x.Issuer).HasMaxLength(500);
        previews.Property(x => x.Subject).HasMaxLength(200);
        previews.Property(x => x.Mode).HasMaxLength(12);
        previews.Property(x => x.Format).HasMaxLength(20);
        previews.Property(x => x.FileHash).HasMaxLength(64);

        var audit = model.Entity<FinanceAudit>();
        audit.ToTable("mutation_audit");
        audit.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Issuer, x.Subject, x.OperationId }).IsUnique();
        audit.Property(x => x.Issuer).HasMaxLength(500);
        audit.Property(x => x.Subject).HasMaxLength(200);
        audit.Property(x => x.Action).HasMaxLength(80);
        audit.Property(x => x.Fingerprint).HasMaxLength(64);
        RecordChangeConfiguration.Configure(model);
    }
}
