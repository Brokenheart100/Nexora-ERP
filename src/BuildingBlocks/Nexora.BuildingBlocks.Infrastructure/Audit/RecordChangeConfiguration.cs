using Microsoft.EntityFrameworkCore;

namespace Nexora.BuildingBlocks.Infrastructure;

public static class RecordChangeConfiguration
{
    public static void Configure(ModelBuilder model)
    {
        var change = model.Entity<RecordChange>();
        change.ToTable("record_changes");
        change.HasKey(entity => entity.Id);
        change.Property(entity => entity.Service).HasMaxLength(64).IsRequired();
        change.Property(entity => entity.EntityName).HasMaxLength(256).IsRequired();
        change.Property(entity => entity.EntityId).HasMaxLength(256).IsRequired();
        change.Property(entity => entity.Operation).HasMaxLength(16).IsRequired();
        change.Property(entity => entity.ActorIssuer).HasMaxLength(256).IsRequired();
        change.Property(entity => entity.ActorSubject).HasMaxLength(256).IsRequired();
        change.Property(entity => entity.ChangedProperties).HasMaxLength(4000);
        change.HasIndex(entity => new { entity.TenantId, entity.WorkspaceId, entity.OccurredAtUtc });
        change.HasIndex(entity => new { entity.TenantId, entity.WorkspaceId, entity.EntityName, entity.EntityId });
        change.HasIndex(entity => new { entity.TenantId, entity.WorkspaceId, entity.Operation });
    }
}
