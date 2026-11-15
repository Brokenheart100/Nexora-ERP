using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class ReconciliationModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var row = model.Entity<BankReconciliation>();
        row.ToTable("bank_reconciliations");
        row.Property(x => x.Id).ValueGeneratedNever();
        row.Property(x => x.Version).IsConcurrencyToken();
        row.Property(x => x.StatementBalance).HasPrecision(20, 6);
        row.Property(x => x.MakerIssuer).HasMaxLength(500);
        row.Property(x => x.MakerSubject).HasMaxLength(200);
        row.Property(x => x.UndoReason).HasMaxLength(300);
        row.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.BankId, x.Through }).IsUnique().HasFilter("\"State\" = 2");
    }
}
