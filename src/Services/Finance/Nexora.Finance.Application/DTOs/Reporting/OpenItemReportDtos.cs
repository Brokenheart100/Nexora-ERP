using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record AgingBucket(string Key, int Count, decimal Amount);

public sealed record AgingReport(string Kind, string Currency, int MinorUnits, DateOnly Through, long Watermark, decimal Total,
    AgingBucket[] Buckets, OpenItem[] Items);

public sealed record FinanceOverview(string Currency, int MinorUnits, StatementPeriod Period, long Watermark,
    decimal Income, decimal Expense, decimal Profit, decimal Cash, decimal Receivable, decimal Payable);
