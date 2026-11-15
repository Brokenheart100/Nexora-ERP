using Nexora.ServiceDefaults.Http;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Net.Http.Headers;
using Nexora.Finance.Application;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class InvoicePdfEndpoints
{
    private const string Document = "/api/finance/workspaces/{workspaceId:guid}/receivables/documents/{id:guid}";
    private const string Shares = "/api/finance/workspaces/{workspaceId:guid}/receivables/shares";

    [Authorize, WolverineGet(Document + "/pdf")]
    public static async Task<IResult> Pdf(Guid workspaceId, Guid id, [FromQuery] bool? preview, HttpContext context,
        ReceivableUseCases service, IInvoiceRenderer renderer, CancellationToken ct)
    {
        var file = await service.PdfAsync(workspaceId, id, preview == true, renderer, ct);
        context.Response.Headers.XContentTypeOptions = "nosniff";
        if (preview == true)
        {
            var header = new ContentDispositionHeaderValue("inline");
            header.SetHttpFileName(file.FileName);
            context.Response.Headers.ContentDisposition = header.ToString();
        }
        return Results.File(file.Bytes, "application/pdf", preview == true ? null : file.FileName);
    }

    [AllowAnonymous, WolverinePost("/public/invoice-pdf")]
    public static async Task<IResult> PublicPdf(SharedPdfRequest request, HttpContext context, ReceivableUseCases service,
        IInvoiceShares shares, IInvoiceRenderer renderer, CancellationToken ct)
    {
        var file = await service.SharedPdfAsync(request.Token, shares, renderer, ct);
        context.Response.Headers["Referrer-Policy"] = "no-referrer";
        context.Response.Headers.XContentTypeOptions = "nosniff";
        return Results.File(file.Bytes, "application/pdf", file.FileName);
    }

    [Authorize, WolverineGet(Document + "/shares")]
    public static Task<InvoiceShareView[]> List(Guid workspaceId, Guid id, ReceivableUseCases service, IInvoiceShares shares, CancellationToken ct) =>
        service.SharesAsync(workspaceId, id, shares, ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Document + "/shares")]
    public static Task<InvoiceShareView> Create(Guid workspaceId, Guid id, ShareRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InvoiceShareView>(new CreateInvoiceShare(workspaceId, request.OperationId, id, request.LifetimeMinutes), ct);

    [IdempotentWrite]
    [Authorize, WolverinePost(Shares + "/{id:guid}/revoke")]
    public static Task<InvoiceShareView> Revoke(Guid workspaceId, Guid id, RevokeRequest request, IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<InvoiceShareView>(new RevokeInvoiceShare(workspaceId, request.OperationId, id), ct);
}
