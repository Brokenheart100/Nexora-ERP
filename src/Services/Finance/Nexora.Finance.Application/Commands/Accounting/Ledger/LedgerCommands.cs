namespace Nexora.Finance.Application;

public sealed record StartJournal(Guid WorkspaceId, Guid OperationId, string Kind, string? SourceNumber, JournalDraftInput Draft);

public sealed record EditJournal(Guid WorkspaceId, Guid OperationId, Guid JournalId, long ExpectedVersion, JournalDraftInput Draft);

public sealed record DecideJournal(Guid WorkspaceId, Guid OperationId, Guid JournalId, long ExpectedVersion, string Decision);

public sealed record ReverseJournal(Guid WorkspaceId, Guid OperationId, Guid JournalId, long ExpectedVersion, DateOnly On, string Reason);

public sealed record MoveFiscalPeriod(Guid WorkspaceId, Guid OperationId, DateOnly Month, long ExpectedVersion, string Action, string Reason);

public sealed record CreateJournalLink(Guid WorkspaceId, Guid OperationId, Guid FromJournalId, Guid ToJournalId, string Kind, string? Memo);

public sealed record DeleteJournalLink(Guid WorkspaceId, Guid OperationId, Guid LinkId, long ExpectedVersion);
