using Nexora.Sales.Application;

namespace Nexora.Sales.Api;

public static partial class SalesEndpoints
{
    public sealed record CreateRequest(string Number, SalesDraft Draft, bool IsQuote = false, Guid? OperationId = null);
    public sealed record EditRequest(SalesDraft Draft, Guid? OperationId = null, long? ExpectedVersion = null);
    public sealed record DecisionRequest(string Decision, string? Reason = null, Guid? OperationId = null, long? ExpectedVersion = null);
    public sealed record ConvertRequest(string OrderNumber, Guid? OperationId = null, long? ExpectedVersion = null);
}
