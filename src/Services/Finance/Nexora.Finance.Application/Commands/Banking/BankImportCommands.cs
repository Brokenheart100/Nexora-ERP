namespace Nexora.Finance.Application;

public sealed record PreviewBankImport(Guid WorkspaceId, Guid BankId, string File, BankCsvMapping Mapping);

public sealed record CommitBankImport(Guid WorkspaceId, Guid OperationId, Guid PreviewId);

public sealed record MatchStatement(Guid WorkspaceId, Guid OperationId, Guid LineId, Guid MovementId, long ExpectedVersion, decimal Amount);

public sealed record ReleaseMatch(Guid WorkspaceId, Guid OperationId, Guid MatchId, string Reason);

public sealed record ExcludeStatement(Guid WorkspaceId, Guid OperationId, Guid LineId, long ExpectedVersion, bool Exclude, string Reason);
