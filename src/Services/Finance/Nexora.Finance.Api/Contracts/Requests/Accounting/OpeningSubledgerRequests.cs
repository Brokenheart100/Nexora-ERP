namespace Nexora.Finance.Api;

public sealed record OpeningSubledgerPreviewRequest(Guid EquityAccountId, string File);
public sealed record OpeningSubledgerSubmitRequest(Guid OperationId, Guid EquityAccountId, string File, string FileHash, long ChartRevision);
public sealed record OpeningSubledgerDecisionRequest(Guid OperationId, long ExpectedVersion, string Decision);
