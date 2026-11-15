using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Api;

public static partial class TradeEndpoints
{
    public sealed record SetupRequest(Guid OperationId, TradeAccounts Accounts);
    public sealed record BankRequest(Guid OperationId, string Code, string Name, string Kind, Guid AccountId);
    public sealed record VersionRequest(Guid OperationId, long ExpectedVersion);
    public sealed record OperationRequest(Guid OperationId);
    public sealed record SubmitRequest(Guid OperationId, TradeTerms Terms);
    public sealed record DecideRequest(Guid OperationId, long ExpectedVersion, string Decision);
    public sealed record PreviewRequest(Guid BankId, string File, BankCsvMapping Mapping);
    public sealed record MatchRequest(Guid OperationId, Guid MovementId, long ExpectedVersion, decimal Amount);
    public sealed record ReasonRequest(Guid OperationId, string Reason);
    public sealed record ExcludeRequest(Guid OperationId, long ExpectedVersion, bool Exclude, string Reason);
}
