namespace Nexora.Finance.Application;

public sealed record PrepareFiscalYear(Guid WorkspaceId, Guid OperationId, int Year, Guid EquityAccountId);

public sealed record DecideFiscalYear(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, string Decision, string? Reason);
