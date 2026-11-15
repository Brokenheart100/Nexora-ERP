namespace Nexora.Finance.Application;

public sealed record CreateInvoiceShare(Guid WorkspaceId, Guid OperationId, Guid InvoiceId, int LifetimeMinutes);

public sealed record RevokeInvoiceShare(Guid WorkspaceId, Guid OperationId, Guid ShareId);
