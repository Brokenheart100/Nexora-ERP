using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class RecurringModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var schedules = model.Entity<InvoiceSchedule>();
        schedules.ToTable("invoice_schedules");
        schedules.Property(x => x.Id).ValueGeneratedNever();
        schedules.Property(x => x.Version).IsConcurrencyToken();
        schedules.Property(x => x.MakerIssuer).HasMaxLength(500);
        schedules.Property(x => x.MakerSubject).HasMaxLength(200);
        schedules.Property(x => x.PendingReason).HasMaxLength(500);
        schedules.HasAlternateKey(x => new { x.TenantId, x.WorkspaceId, x.Id });
        schedules.Property(x => x.Terms).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<RecurringTerms>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb");
        var occurrences = model.Entity<InvoiceOccurrence>();
        occurrences.ToTable("invoice_occurrences");
        occurrences.HasKey(x => new { x.TenantId, x.WorkspaceId, x.ScheduleId, x.On });
        occurrences.HasOne<InvoiceSchedule>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.ScheduleId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
    }
}
