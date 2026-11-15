using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record ConfigureReceivables(Guid WorkspaceId, Guid OperationId, ReceivableAccounts Accounts);

public sealed record SubmitCustomerDocument(Guid WorkspaceId, Guid OperationId, CustomerDraft Draft);

public sealed record ReviseCustomerInvoice(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, CustomerDraft Draft);

public sealed record DecideCustomerDocument(Guid WorkspaceId, Guid OperationId, Guid Id, long ExpectedVersion, bool Approve);
