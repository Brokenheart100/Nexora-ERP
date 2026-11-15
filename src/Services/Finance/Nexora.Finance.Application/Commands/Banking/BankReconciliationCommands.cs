namespace Nexora.Finance.Application;

public sealed record PrepareReconciliation(Guid WorkspaceId, Guid OperationId, Guid BankId, DateOnly Through, decimal StatementBalance);

public sealed record DecideReconciliation(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, string Decision, string? Reason);
