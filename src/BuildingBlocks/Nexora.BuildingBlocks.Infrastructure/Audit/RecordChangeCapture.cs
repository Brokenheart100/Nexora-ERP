using Nexora.BuildingBlocks.Application;
using System.Collections.Concurrent;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;

namespace Nexora.BuildingBlocks.Infrastructure;

// Builds snapshot rows from EF Core change-tracker entries. Scope is read from entity properties.
public static class RecordChangeCapture
{
    private const int MaxStringLength = 1000;
    private const int MaxJsonLength = 16000;
    private const int MaxEntityIdLength = 256;

    private static readonly JsonSerializerOptions JsonOptions = new() { Converters = { new JsonStringEnumConverter() } };
    private static readonly ConcurrentDictionary<Type, ScopeAccessors> Accessors = new();

    public static IReadOnlyList<RecordChange> Capture(DbContext context, string service, ActorContext? actor,
        DateTimeOffset occurredAtUtc)
    {
        var changes = new List<RecordChange>();
        var actorIssuer = actor?.Issuer ?? "system";
        var actorSubject = actor?.Subject ?? "system";
        foreach (var entry in context.ChangeTracker.Entries().ToArray())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted)) continue;
            var entityType = entry.Metadata.ClrType;
            if (entityType == typeof(RecordChange) || entityType.Name.EndsWith("Audit", StringComparison.Ordinal)) continue;
            var scope = ResolveScope(entry);
            if (scope is null) continue;

            var operation = entry.State switch
            {
                EntityState.Added => RecordChangeOperations.Created,
                EntityState.Modified => RecordChangeOperations.Updated,
                _ => RecordChangeOperations.Deleted,
            };
            changes.Add(new RecordChange
            {
                Id = Guid.NewGuid(),
                TenantId = scope.Value.TenantId,
                WorkspaceId = scope.Value.WorkspaceId,
                Service = service,
                EntityName = entityType.Name,
                EntityId = ResolveEntityId(entry),
                Operation = operation,
                ActorIssuer = actorIssuer,
                ActorSubject = actorSubject,
                OccurredAtUtc = occurredAtUtc,
                ChangedProperties = operation == RecordChangeOperations.Updated ? ResolveChangedProperties(entry) : null,
                BeforeJson = entry.State == EntityState.Added ? null : Snapshot(entry, original: true),
                AfterJson = entry.State == EntityState.Deleted ? null : Snapshot(entry, original: false),
            });
        }

        return changes;
    }

    private static (Guid TenantId, Guid WorkspaceId)? ResolveScope(EntityEntry entry)
    {
        var accessors = Accessors.GetOrAdd(entry.Metadata.ClrType, static type => new ScopeAccessors(
            type.GetProperty("TenantId"), type.GetProperty("WorkspaceId")));
        if (accessors.TenantId?.GetValue(entry.Entity) is not Guid tenantId || tenantId == Guid.Empty) return null;
        if (accessors.WorkspaceId?.GetValue(entry.Entity) is Guid workspaceId && workspaceId != Guid.Empty)
            return (tenantId, workspaceId);
        if (entry.Metadata.ClrType.Name == "Workspace")
        {
            var key = entry.Properties.FirstOrDefault(property => property.Metadata.IsPrimaryKey());
            if (key is not null && (key.CurrentValue ?? key.OriginalValue) is Guid id && id != Guid.Empty)
                return (tenantId, id);
        }

        return null;
    }

    private static string ResolveEntityId(EntityEntry entry)
    {
        var parts = entry.Properties.Where(property => property.Metadata.IsPrimaryKey())
            .Select(property => (property.CurrentValue ?? property.OriginalValue)?.ToString() ?? string.Empty)
            .ToArray();
        var id = string.Join('|', parts);
        return id.Length <= MaxEntityIdLength ? id : id[..MaxEntityIdLength];
    }

    private static string? ResolveChangedProperties(EntityEntry entry)
    {
        var names = entry.Properties.Where(property => property.IsModified).Select(property => property.Metadata.Name)
            .ToArray();
        return names.Length == 0 ? null : string.Join(',', names);
    }

    private static string? Snapshot(EntityEntry entry, bool original)
    {
        var values = new SortedDictionary<string, object?>(StringComparer.Ordinal);
        foreach (var property in entry.Properties)
        {
            if (!IsScalar(property.Metadata.ClrType)) continue;
            var value = original ? property.OriginalValue : property.CurrentValue;
            if (value is string text && text.Length > MaxStringLength) value = text[..MaxStringLength] + "...";
            values[property.Metadata.Name] = value;
        }

        if (values.Count == 0) return null;
        var json = JsonSerializer.Serialize(values, JsonOptions);
        return json.Length <= MaxJsonLength ? json : json[..MaxJsonLength] + "...";
    }

    private static bool IsScalar(Type type)
    {
        var underlying = Nullable.GetUnderlyingType(type) ?? type;
        return underlying.IsEnum || underlying == typeof(string) || underlying == typeof(Guid) ||
            underlying == typeof(decimal) || underlying == typeof(int) || underlying == typeof(long) ||
            underlying == typeof(short) || underlying == typeof(byte) || underlying == typeof(bool) ||
            underlying == typeof(double) || underlying == typeof(float) || underlying == typeof(DateTime) ||
            underlying == typeof(DateTimeOffset) || underlying == typeof(DateOnly) || underlying == typeof(TimeOnly) ||
            underlying == typeof(uint) || underlying == typeof(ulong) || underlying == typeof(ushort) ||
            underlying == typeof(sbyte);
    }

    private sealed record ScopeAccessors(PropertyInfo? TenantId, PropertyInfo? WorkspaceId);
}
