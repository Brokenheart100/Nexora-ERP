namespace Nexora.Finance.Api;

public static partial class BankReconciliationEndpoints
{
    public sealed record PreviewRequest(DateOnly Through, decimal StatementBalance);
    public sealed record PrepareRequest(Guid OperationId, DateOnly Through, decimal StatementBalance);
    public sealed record DecisionRequest(Guid OperationId, long ExpectedVersion, string Decision, string? Reason);
}
