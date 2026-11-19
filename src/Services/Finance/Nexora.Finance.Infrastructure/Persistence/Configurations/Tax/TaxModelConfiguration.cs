using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class TaxModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var rates = model.Entity<TaxRate>();
        rates.ToTable("tax_rates").HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Code, x.EffectiveOn }).IsUnique();
        rates.Property(x => x.Code).HasMaxLength(40);
        rates.Property(x => x.Name).HasMaxLength(160);
        rates.Property(x => x.Rate).HasPrecision(7, 6);
        rates.HasOne<AccountingBook>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);
        var groups = model.Entity<TaxGroup>();
        groups.ToTable("tax_groups").HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Code, x.Version }).IsUnique();
        groups.Property(x => x.Code).HasMaxLength(40);
        groups.Property(x => x.Name).HasMaxLength(160);
        groups.Property(x => x.RateCodes).HasMaxLength(327);
        groups.HasOne<AccountingBook>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);
        var classifications = model.Entity<TaxClassification>();
        classifications.ToTable("tax_classifications")
            .HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Kind, x.ResourceId, x.Version }).IsUnique();
        classifications.Property(x => x.Kind).HasMaxLength(7);
        classifications.Property(x => x.GroupCode).HasMaxLength(40);
        classifications.HasOne<AccountingBook>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);
        var assessments = model.Entity<TaxAssessment>();
        assessments.ToTable("tax_assessments");
        assessments.Property(x => x.SnapshotJson).HasColumnType("jsonb");
        assessments.HasOne<AccountingBook>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);

        model.Entity<AccountingBook>().Property(x => x.TaxCycle).HasDefaultValue(TaxCycle.Monthly);
        model.Entity<AccountingBook>().Property(x => x.TaxBasis).HasDefaultValue(TaxBasis.Accrual);
        var filings = model.Entity<TaxFiling>();
        filings.ToTable("tax_filings").HasIndex(x => new { x.TenantId, x.WorkspaceId, x.From, x.Through, x.Version }).IsUnique();
        filings.Property(x => x.Fingerprint).HasMaxLength(64);
        filings.Property(x => x.Reference).HasMaxLength(100);
        filings.Property(x => x.Reason).HasMaxLength(300);
        filings.Property(x => x.SnapshotJson).HasColumnType("jsonb");
        filings.Property(x => x.FiledByIssuer).HasMaxLength(500);
        filings.Property(x => x.FiledBySubject).HasMaxLength(200);
        filings.HasOne<AccountingBook>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);
    }
}
