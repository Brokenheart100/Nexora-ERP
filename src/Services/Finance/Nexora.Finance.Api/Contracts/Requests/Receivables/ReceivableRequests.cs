using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Api;

public static partial class ReceivableEndpoints
{
    public sealed record SetupRequest(Guid OperationId, ReceivableAccounts Accounts);
    public sealed record SubmitRequest(Guid OperationId, CustomerDraft Draft);
    public sealed record ReviseRequest(Guid OperationId, long ExpectedVersion, CustomerDraft Draft);
    public sealed record DecisionRequest(Guid OperationId, long ExpectedVersion, bool Approve, string? ExpectedNumber);
    public sealed record InvoiceNumberingRequest(Guid OperationId, long ExpectedVersion, string? Pattern, long StartingNumber);
}
