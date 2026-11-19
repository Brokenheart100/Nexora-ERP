namespace Nexora.Finance.Api;

public sealed record OpeningBalancePreviewRequest(DateOnly On, string File);

public sealed record OpeningBalanceImportRequest(Guid OperationId, DateOnly On, string Memo, string File, string FileHash, long ChartRevision);
