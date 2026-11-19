using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class OpeningSubledgerConfiguration
{
    public static void Configure(ModelBuilder model)
    {
        var batch = model.Entity<OpeningSubledgerBatch>();
        batch.ToTable("opening_subledger_batches");
        batch.Property(x => x.Id).ValueGeneratedNever();
        batch.Property(x => x.Version).IsConcurrencyToken();
        batch.Property(x => x.FileHash).HasMaxLength(64);
        batch.Property(x => x.Currency).HasMaxLength(3);
        batch.Property(x => x.Rejection).HasMaxLength(300);
        batch.Property(x => x.Maker).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<JournalActor>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb");
        batch.Property(x => x.Reviewer).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<JournalActor>(x, (JsonSerializerOptions?)null)).HasColumnType("jsonb");
        batch.Property(x => x.Rows).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<OpeningSubledgerRow[]>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb")
            .Metadata.SetValueComparer(ArrayComparer<OpeningSubledgerRow>());
        batch.Property(x => x.Postings).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<OpeningSubledgerPosting[]>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb")
            .Metadata.SetValueComparer(ArrayComparer<OpeningSubledgerPosting>());
        batch.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Id });
        batch.HasIndex(x => new { x.TenantId, x.WorkspaceId }).IsUnique().HasFilter("\"State\" IN (0, 1, 2)");
    }

    private static ValueComparer<T[]> ArrayComparer<T>() => new(
        (left, right) => left == right || left != null && right != null && left.SequenceEqual(right),
        values => values.Aggregate(0, (hash, value) => HashCode.Combine(hash, value)),
        values => values.ToArray());
}
