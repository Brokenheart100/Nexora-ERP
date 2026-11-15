namespace Nexora.Finance.Api;

public static partial class FinanceCapabilityEndpoints
{
    public sealed record FinanceCapabilities(string InvoiceMail, bool WorkspaceMailSender, bool StatutoryDonationReceipt);
}
