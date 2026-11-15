namespace Nexora.Finance.Domain;

public sealed record ReceivableSetup(Guid TenantId, Guid WorkspaceId, ReceivableAccounts Accounts);
