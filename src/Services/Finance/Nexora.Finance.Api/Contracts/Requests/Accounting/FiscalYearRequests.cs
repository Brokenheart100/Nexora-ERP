namespace Nexora.Finance.Api;

public static partial class FiscalYearEndpoints
{
    public sealed record PrepareRequest(Guid OperationId, int Year, Guid EquityAccountId);
    public sealed record DecisionRequest(Guid OperationId, long ExpectedVersion, string Decision, string? Reason);
}
