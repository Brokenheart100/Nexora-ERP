namespace Nexora.Finance.Api;

public static partial class TaxEndpoints
{
    public sealed record RateRequest(Guid OperationId, string Code, string Name, DateOnly EffectiveOn, decimal? Rate);
    public sealed record GroupRequest(Guid OperationId, string Code, string Name, long ExpectedVersion, string[] RateCodes);
    public sealed record ClassificationRequest(Guid OperationId, string Kind, Guid ResourceId, string GroupCode, long ExpectedVersion);
    public sealed record AssessRequest(Guid OperationId, DateOnly On, string? GroupCode, Guid? ItemId, Guid? PartnerId,
        decimal? UnitPrice, decimal? Quantity, decimal? Discount, bool? IncludesTax);
}
