using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record JournalLinkView(Guid Id, Guid FromJournalId, string FromSourceNumber, DateOnly FromOn,
    Guid ToJournalId, string ToSourceNumber, DateOnly ToOn, string Kind, string Memo,
    string CreatedByIssuer, string CreatedBySubject, DateTimeOffset CreatedAtUtc, long Version);

public sealed record JournalLinkChange(Guid Id, long Version);

public sealed record JournalLinkIssue(string Code, Guid? LinkId, Guid? JournalId, string Message);

public sealed record JournalLinkScan(DateTimeOffset ScannedAtUtc, int LinkCount, int JournalCount, JournalLinkIssue[] Issues);

public sealed record JournalScanRow(Guid Id, string SourceNumber, DateOnly On, JournalState State, Guid? ReversesId);
