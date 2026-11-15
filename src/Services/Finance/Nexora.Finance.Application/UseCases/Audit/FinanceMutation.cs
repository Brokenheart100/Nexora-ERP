using System.Security.Cryptography;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;

namespace Nexora.Finance.Application;

public sealed class FinanceMutation(IChartStore store, TimeProvider clock)
{
    public async Task<FinanceAudit?> ReplayAsync(BookAccess access, Guid operationId, string action, object input, CancellationToken ct)
    {
        if (operationId == Guid.Empty) throw new ArgumentException("An operation identifier is required.");
        var receipt = await store.FindAuditAsync(access, operationId, ct);
        if (receipt is not null && (receipt.Action != action || receipt.Fingerprint != Fingerprint(input)))
            throw new IdempotencyConflictException();
        return receipt;
    }

    public void Record(BookAccess access, Guid operationId, string action, object input, Guid target, long version) =>
        store.Add(new FinanceAudit(Guid.CreateVersion7(), access.Scope.TenantId, access.Scope.WorkspaceId, access.Actor.Issuer,
            access.Actor.Subject, operationId, action, Fingerprint(input), target, version, clock.GetUtcNow()));

    private static string Fingerprint(object input) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(input)));
}
