namespace Nexora.Finance.Application;

public sealed record SaveChartAccount(Guid WorkspaceId, Guid OperationId, long ExpectedRevision, long? ExpectedVersion, AccountInput Account);

public sealed record PreviewChartImport(Guid WorkspaceId, string Mode, string Format, string File);

public sealed record CommitChartImport(Guid WorkspaceId, Guid PreviewId, Guid OperationId);
