using Microsoft.AspNetCore.Authorization;
using Nexora.Finance.Application;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class FinanceCapabilityEndpoints
{

    [Authorize, WolverineGet("/api/finance/workspaces/{workspaceId:guid}/capabilities")]
    public static async Task<FinanceCapabilities> Read(Guid workspaceId, TradeAccess access, IInvoiceMail mail, CancellationToken ct)
    {
        await access.ReadAsync(workspaceId, ct);
        return new(mail.ChannelStatus, WorkspaceMailSender: false, StatutoryDonationReceipt: false);
    }
}
