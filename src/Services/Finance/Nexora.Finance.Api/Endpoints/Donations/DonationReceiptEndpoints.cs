using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Nexora.Finance.Application;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class DonationReceiptEndpoints
{
    private const string Root = "/api/finance/workspaces/{workspaceId:guid}/trade/documents/{id:guid}/donation-receipt";

    [Authorize, WolverineGet(Root)]
    public static Task<DonationReceipt> Read(Guid workspaceId, Guid id, DonationReceipts service, CancellationToken ct) =>
        service.ReadAsync(workspaceId, id, ct);

    [Authorize, WolverineGet(Root + "/pdf")]
    [ProducesResponseType(typeof(byte[]), StatusCodes.Status200OK, "application/pdf")]
    public static async Task<IResult> Pdf(Guid workspaceId, Guid id, DonationReceipts service, IDonationReceiptRenderer renderer,
        HttpContext context, CancellationToken ct)
    {
        var receipt = await service.ReadAsync(workspaceId, id, ct);
        var pdf = await renderer.RenderAsync(receipt, ct);
        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.File(pdf.Bytes, "application/pdf", pdf.FileName);
    }
}
