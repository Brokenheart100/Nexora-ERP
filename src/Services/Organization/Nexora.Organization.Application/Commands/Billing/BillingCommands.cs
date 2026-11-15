using Nexora.BuildingBlocks.Application;

namespace Nexora.Organization.Application;

public sealed record SelectBillingPlan(Guid WorkspaceId, string PlanCode, Guid OperationId, string? PaymentReference, ActorContext Actor) : IUserGovernanceCommand;

public sealed record PayBillingInvoice(Guid WorkspaceId, Guid InvoiceId, Guid OperationId, string Reference, ActorContext Actor) : IUserGovernanceCommand;

public sealed record CancelBillingSubscription(Guid WorkspaceId, Guid OperationId, ActorContext Actor) : IUserGovernanceCommand;

public sealed record ReserveBillingDocuments(Guid WorkspaceId, Guid OperationId, int Count, ActorContext Actor) : IUserGovernanceCommand;
