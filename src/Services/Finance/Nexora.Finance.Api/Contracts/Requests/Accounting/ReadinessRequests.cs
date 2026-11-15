namespace Nexora.Finance.Api;

public sealed record BackfillRequest(Guid OperationId, DateOnly? Through);
