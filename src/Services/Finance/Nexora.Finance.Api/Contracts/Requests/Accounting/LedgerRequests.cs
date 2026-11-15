using Nexora.Finance.Application;

namespace Nexora.Finance.Api;

public static partial class LedgerEndpoints
{
    public sealed record StartRequest(Guid OperationId, string Kind, string? SourceNumber, JournalDraftInput Draft);
    public sealed record EditRequest(Guid OperationId, long ExpectedVersion, JournalDraftInput Draft);
    public sealed record DecisionRequest(Guid OperationId, long ExpectedVersion, string Decision);
    public sealed record ReverseRequest(Guid OperationId, long ExpectedVersion, DateOnly On, string Reason);
    public sealed record PeriodRequest(Guid OperationId, long ExpectedVersion, string Action, string Reason);
    public sealed record CreateLinkRequest(Guid OperationId, Guid FromJournalId, Guid ToJournalId, string Kind, string? Memo);
    public sealed record DeleteLinkRequest(Guid OperationId, long ExpectedVersion);
}
