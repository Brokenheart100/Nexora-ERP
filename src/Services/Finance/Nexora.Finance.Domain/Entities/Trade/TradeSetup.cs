namespace Nexora.Finance.Domain;

public sealed record TradeSetup(Guid TenantId, Guid WorkspaceId, long Version, Guid InventoryAccountId, Guid AccrualAccountId,
    Guid PayableAccountId, Guid InputTaxAccountId, Guid VarianceAccountId, Guid DonationIncomeAccountId, Guid? SupplierRecoveryAccountId);
