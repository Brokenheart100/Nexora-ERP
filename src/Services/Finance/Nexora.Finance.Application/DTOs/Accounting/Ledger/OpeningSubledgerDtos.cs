using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record OpeningSubledgerPreview(string FileHash, long ChartRevision, DateOnly On, string Currency,
    OpeningSubledgerRow[] Rows, OpeningBalanceIssue[] Errors);

public sealed record OpeningSubledgerView(Guid Id, string State, long Version, DateOnly On, string Currency, string FileHash,
    Guid EquityAccountId, OpeningSubledgerRow[] Rows, OpeningSubledgerPosting[] Postings, string? Rejection, bool IsMaker,
    OpeningSubledgerCheck[] Checks);

public sealed record OpeningSubledgerCheck(Guid RowId, Guid AccountId, decimal Imported, decimal Subledger,
    decimal Ledger, bool Matched);

public sealed record OpeningStockPlan(Guid BatchId, Guid TenantId, Guid WorkspaceId, DateOnly On, string Currency, OpeningSubledgerRow[] Rows);
