namespace Nexora.Finance.Application;

public sealed record BackfillReadiness(Guid WorkspaceId, Guid OperationId, DateOnly? Through);
