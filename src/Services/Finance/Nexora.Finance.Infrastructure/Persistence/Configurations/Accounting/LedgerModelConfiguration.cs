using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class LedgerModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var periods = model.Entity<FiscalPeriod>();
        periods.ToTable("fiscal_periods");
        periods.HasKey(x => new { x.TenantId, x.WorkspaceId, x.Month });
        periods.Property(x => x.Version).IsConcurrencyToken();
        periods.HasOne<AccountingBook>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);

        var transitions = model.Entity<PeriodTransition>();
        transitions.ToTable("period_transitions").HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Month, x.Version }).IsUnique();
        transitions.Property(x => x.Reason).HasMaxLength(300);
        transitions.Property(x => x.Issuer).HasMaxLength(500);
        transitions.Property(x => x.Subject).HasMaxLength(200);
        transitions.HasOne<FiscalPeriod>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.Month })
            .OnDelete(DeleteBehavior.Restrict);

        var journals = model.Entity<Journal>();
        journals.ToTable("journals");
        journals.Property(x => x.Id).ValueGeneratedNever();
        journals.HasAlternateKey(x => new { x.TenantId, x.WorkspaceId, x.Id });
        journals.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.SourceKey }).IsUnique().HasFilter("\"State\" <> 4");
        journals.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.PostingNumber }).IsUnique();
        journals.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.On });
        journals.Property(x => x.Version).IsConcurrencyToken();
        journals.Property(x => x.SourceKey).HasMaxLength(87);
        journals.Property(x => x.SourceNumber).HasMaxLength(80);
        journals.Property(x => x.Memo).HasMaxLength(300);
        journals.Property(x => x.MakerIssuer).HasMaxLength(500);
        journals.Property(x => x.MakerSubject).HasMaxLength(200);
        journals.Property(x => x.ReviewerIssuer).HasMaxLength(500);
        journals.Property(x => x.ReviewerSubject).HasMaxLength(200);
        journals.HasOne<AccountingBook>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId }).OnDelete(DeleteBehavior.Restrict);
        journals.HasOne<Journal>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.ReversesId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        journals.HasMany(x => x.Lines).WithOne().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.JournalId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Cascade);
        journals.Navigation(x => x.Lines).HasField("_lines").UsePropertyAccessMode(PropertyAccessMode.Field);

        var links = model.Entity<JournalLink>();
        links.ToTable("journal_links");
        links.Property(x => x.Id).ValueGeneratedNever();
        links.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.FromJournalId, x.ToJournalId, x.Kind }).IsUnique();
        links.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.CreatedAtUtc });
        links.Property(x => x.Version).IsConcurrencyToken();
        links.Property(x => x.Kind).HasMaxLength(24);
        links.Property(x => x.Memo).HasMaxLength(300);
        links.Property(x => x.CreatedByIssuer).HasMaxLength(500);
        links.Property(x => x.CreatedBySubject).HasMaxLength(200);

        var lines = model.Entity<JournalLine>();
        lines.ToTable("journal_lines", table => table.HasCheckConstraint("ck_journal_line_amounts",
            "(\"Debit\" > 0 AND \"Credit\" = 0) OR (\"Credit\" > 0 AND \"Debit\" = 0)"));
        lines.Property(x => x.Id).ValueGeneratedNever();
        lines.Property(x => x.Code).HasMaxLength(40);
        lines.Property(x => x.Name).HasMaxLength(160);
        lines.Property(x => x.Debit).HasPrecision(20, 6);
        lines.Property(x => x.Credit).HasPrecision(20, 6);
        lines.HasOne<ChartAccount>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.AccountId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
    }
}
