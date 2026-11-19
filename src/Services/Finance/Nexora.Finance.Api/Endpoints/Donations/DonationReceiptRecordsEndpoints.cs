using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.AspNetCore.Mvc;
using Nexora.Finance.Application;
using Nexora.ServiceDefaults.Http;
using Wolverine;
using Wolverine.Http;

namespace Nexora.Finance.Api;

public static partial class DonationReceiptEndpoints
{
    [Authorize, WolverineGet(Root + "/fiscal-tickets")]
    public static Task<DonationFiscalTicketView[]> Tickets(Guid workspaceId, Guid id, DonationFiscalTickets tickets, CancellationToken ct) =>
        tickets.ListAsync(workspaceId, id, ct);

    [Authorize, WolverineGet(Root + "/fiscal-tickets/{ticketId:guid}")]
    public static Task<DonationFiscalTicketView> Ticket(Guid workspaceId, Guid id, Guid ticketId, DonationFiscalTickets tickets, CancellationToken ct) =>
        tickets.DetailAsync(workspaceId, id, ticketId, ct);

    [ApiWrite]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [Authorize, WolverinePost(Root + "/fiscal-tickets")]
    public static async Task<Created<DonationFiscalTicketView>> Link(Guid workspaceId, Guid id, DonationFiscalTicketRequest request,
        IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<DonationFiscalTicketView>(
            new LinkDonationFiscalTicket(workspaceId, id, request.OperationId, request.Code, request.Number, request.IssuedOn), ct);
        return TypedResults.Created($"{ReceiptPath(workspaceId, id)}/fiscal-tickets/{result.Id}", result);
    }

    [Authorize, WolverineGet(Root + "/dispatches")]
    public static Task<DonationDispatchView[]> Dispatches(Guid workspaceId, Guid id, DonationReceiptMail mail, CancellationToken ct) =>
        mail.ListAsync(workspaceId, id, ct);

    [RevisionTagged]
    [Authorize, WolverineGet(Root + "/dispatches/{dispatchId:guid}")]
    public static async Task<DonationDispatchView> Dispatch(Guid workspaceId, Guid id, Guid dispatchId, DonationReceiptMail mail,
        HttpContext context, CancellationToken ct)
    {
        var result = await mail.DetailAsync(workspaceId, id, dispatchId, ct);
        ApiIdempotency.SetRevision(context.Response, result.Version);
        return result;
    }

    [ApiWrite]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [Authorize, WolverinePost(Root + "/dispatches")]
    public static async Task<Created<DonationDispatchView>> Queue(Guid workspaceId, Guid id, DonationReceiptMailRequest request,
        IMessageBus bus, CancellationToken ct)
    {
        var result = await bus.InvokeAsync<DonationDispatchView>(
            new QueueDonationReceiptMail(workspaceId, id, request.OperationId, request.Recipient), ct);
        return TypedResults.Created($"{ReceiptPath(workspaceId, id)}/dispatches/{result.Id}", result);
    }

    [ApiWrite("expectedVersion")]
    [Authorize, WolverinePost(Root + "/dispatches/{dispatchId:guid}/decision")]
    public static Task<DonationDispatchView> Decide(Guid workspaceId, Guid id, Guid dispatchId, DonationReceiptMailDecision request,
        IMessageBus bus, CancellationToken ct) =>
        bus.InvokeAsync<DonationDispatchView>(
            new DecideDonationReceiptMail(workspaceId, id, dispatchId, request.OperationId, request.ExpectedVersion, request.Decision), ct);

    private static string ReceiptPath(Guid workspaceId, Guid donationId) => $"/api/finance/workspaces/{workspaceId}/trade/documents/{donationId}/donation-receipt";
}
