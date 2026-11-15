using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record TaxChange(Guid Id, long Version);

public sealed record TaxGroupView(string Code, string Name, long Version, string[] RateCodes);

public sealed record TaxSetup(bool CanManage, TaxRate[] Rates, TaxGroupView[] Groups, TaxClassification[] Classifications);

public sealed record TaxReference(string Kind, Guid ResourceId, long Version, long? ClassificationVersion);

public sealed record TaxSnapshot(Guid Id, DateOnly On, string Currency, int MinorUnits, string Policy, TaxGroupView Group,
    TaxReference[] References, decimal UnitPrice, decimal Quantity, decimal Discount, bool IncludesTax, TaxAmounts Amounts,
    string? GroupSource = null);
