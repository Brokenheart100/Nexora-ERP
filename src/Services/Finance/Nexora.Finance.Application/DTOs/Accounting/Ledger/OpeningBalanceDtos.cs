namespace Nexora.Finance.Application;

public sealed record OpeningBalancePreview(long ChartRevision, string FileHash, string Currency, decimal Debit, decimal Credit,
    OpeningBalanceRow[] Rows, OpeningBalanceIssue[] Errors);

public sealed record OpeningBalanceRow(long Row, Guid AccountId, string Code, string Name, decimal Debit, decimal Credit);

public sealed record OpeningBalanceIssue(long? Row, string Message);
