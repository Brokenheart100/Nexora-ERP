namespace Nexora.Finance.Application;

public sealed record QueueInvoiceMail(Guid WorkspaceId, Guid OperationId, Guid InvoiceId, string Recipient);

public sealed record DecideInvoiceMail(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, string Decision);

public sealed record DeliverInvoiceMail(Guid TenantId, Guid WorkspaceId, Guid Id, int Attempt);

public sealed record StartInvoiceMail(DeliverInvoiceMail Delivery);

public sealed record InvoiceMailLeaseExpired(DeliverInvoiceMail Delivery);

public sealed record FinishInvoiceMail(DeliverInvoiceMail Delivery, DispatchOutcome Outcome);
