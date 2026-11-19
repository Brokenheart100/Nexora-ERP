namespace Nexora.Finance.Application;

public sealed record SubmitOpeningSubledger(Guid WorkspaceId, Guid OperationId, Guid EquityAccountId, string File, string FileHash, long ChartRevision);

public sealed record DecideOpeningSubledger(Guid WorkspaceId, Guid Id, Guid OperationId, long ExpectedVersion, string Decision);

public sealed record ResumeCostsAfterOpening(Guid TenantId, Guid WorkspaceId, Guid ReceiptId);
