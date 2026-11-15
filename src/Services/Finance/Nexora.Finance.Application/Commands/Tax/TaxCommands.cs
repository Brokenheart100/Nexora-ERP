namespace Nexora.Finance.Application;

public sealed record SetTaxRate(Guid WorkspaceId, Guid OperationId, string Code, string Name, DateOnly EffectiveOn, decimal Rate);

public sealed record SetTaxGroup(Guid WorkspaceId, Guid OperationId, string Code, string Name, long ExpectedVersion, string[] RateCodes);

public sealed record ClassifyForTax(Guid WorkspaceId, Guid OperationId, string Kind, Guid ResourceId, string GroupCode, long ExpectedVersion);

public sealed record AssessTax(Guid WorkspaceId, Guid OperationId, DateOnly On, string? GroupCode, Guid? ItemId,
    Guid? PartnerId, decimal UnitPrice, decimal Quantity, decimal Discount, bool IncludesTax);
