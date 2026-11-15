namespace Nexora.Organization.Api;

public sealed record SelectBillingPlanRequest(string PlanCode, Guid OperationId, string? PaymentReference = null);

public sealed record PayBillingInvoiceRequest(Guid OperationId, string Reference);

public sealed record CancelBillingSubscriptionRequest(Guid OperationId);

public sealed record ReserveBillingDocumentsRequest(Guid OperationId, int Count = 1);
