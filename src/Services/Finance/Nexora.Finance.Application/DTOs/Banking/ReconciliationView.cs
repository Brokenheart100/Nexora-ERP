using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed record ReconciliationView(Guid Id, Guid BankId, long Version, string State, BankReconciliationSnapshot Report, string? UndoReason);
