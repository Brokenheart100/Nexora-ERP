using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record ReportPosting(Guid JournalId, long PostingNumber, DateOnly On, string SourceNumber, string Memo, Guid AccountId,
    string Code, string Name, decimal Debit, decimal Credit, decimal? ReportAmount = null);

public sealed record ReportLine(StatementRow Row, decimal? Previous, decimal? Difference);

public sealed record ReportTotal(string Key, decimal Amount, decimal? Previous, decimal? Difference);

public sealed record FinancialReport(string Kind, string Basis, string Currency, int MinorUnits, StatementPeriod Period,
    StatementPeriod? PreviousPeriod, long Watermark, ReportLine[] Lines, ReportTotal[] Totals);

public sealed record FinancialDrill(StatementPeriod Period, long Watermark, bool HasMore, ReportPosting[] Postings);
