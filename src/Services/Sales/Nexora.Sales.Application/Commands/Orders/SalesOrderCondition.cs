using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Nexora.Sales.Domain;

namespace Nexora.Sales.Application;

public readonly record struct SalesOrderRevision(long Version, bool IsMaker);

public sealed record SalesOrderCondition(bool Any, SalesOrderRevision[] Revisions)
{
    public static void Check(SalesOrder order, SalesActor actor, long expectedVersion, SalesOrderCondition? condition)
    {
        if (condition is null)
        {
            if (order.Version != expectedVersion) throw new SalesVersionConflictException();
            return;
        }

        if ((expectedVersion > 0 && order.Version != expectedVersion) ||
            (!condition.Any && !condition.Revisions.Contains(new(order.Version, order.MadeBy(actor)))))
            throw new SalesPreconditionFailedException();
    }
}

public interface ISalesOrderMutation
{
    long ExpectedVersion { get; }
    SalesOrderCondition? Condition { get; }
}

internal static class SalesOperationFingerprint
{
    private static readonly JsonSerializerOptions ExactVersionOptions = new()
    {
        TypeInfoResolver = new DefaultJsonTypeInfoResolver().WithAddedModifier(type =>
        {
            if (!typeof(ISalesOrderMutation).IsAssignableFrom(type.Type)) return;
            foreach (var property in type.Properties.Where(property => property.Name == nameof(ISalesOrderMutation.Condition)))
                property.ShouldSerialize = static (_, _) => false;
        })
    };

    public static string Compute(object command)
    {
        // Exact versions retain the legacy JSON fingerprint, regardless of which HTTP input supplied the version.
        var options = command is ISalesOrderMutation { ExpectedVersion: > 0 } ? ExactVersionOptions : null;
        var input = JsonSerializer.SerializeToUtf8Bytes(command, options);
        return Convert.ToHexString(SHA256.HashData(input));
    }
}
