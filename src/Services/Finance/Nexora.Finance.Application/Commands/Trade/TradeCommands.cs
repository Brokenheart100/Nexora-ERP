using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record ConfigureTrade(Guid WorkspaceId, Guid OperationId, TradeAccounts Accounts);

public sealed record OpenBank(Guid WorkspaceId, Guid OperationId, string Code, string Name, string Kind, Guid AccountId);

public sealed record DefaultBank(Guid WorkspaceId, Guid OperationId, Guid BankId, long ExpectedVersion);

public sealed record SubmitTrade(Guid WorkspaceId, Guid OperationId, TradeTerms Terms);

public sealed record DecideTrade(Guid WorkspaceId, Guid OperationId, Guid DocumentId, long ExpectedVersion, string Decision);

public sealed record ProcessAccrual(Guid WorkspaceId, Guid OperationId, Guid ReceiptId);
