using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class DonationFiscalTickets(TradeAccess access, DonationReceipts receipts, IDonationFiscalTickets tickets,
    FinanceMutation mutations, TimeProvider clock)
{
    public async Task<DonationFiscalTicketView[]> ListAsync(Guid workspaceId, Guid donationId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        await receipts.FindAsync(current.Scope, donationId, ct);
        return await tickets.FindAsync(current.Scope, donationId, ct) is { } ticket ? [View(ticket)] : [];
    }

    public async Task<DonationFiscalTicketView> DetailAsync(Guid workspaceId, Guid donationId, Guid ticketId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        var ticket = await tickets.FindAsync(current.Scope, donationId, ct);
        return ticket is not null && ticket.Id == ticketId ? View(ticket) : throw new ResourceNotFoundException();
    }

    public async Task<DonationFiscalTicketView> LinkAsync(LinkDonationFiscalTicket command, CancellationToken ct)
    {
        const string action = "donation.fiscal-ticket-linked";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        var donation = await receipts.FindAsync(current.Scope, command.DonationId, ct);
        var existing = await tickets.FindAsync(current.Scope, donation.Id, ct);
        if (replay is not null)
            return existing is not null && existing.Id == replay.TargetId ? View(existing) : throw new ResourceNotFoundException();
        if (existing is not null) throw new BusinessConflictException("A fiscal ticket is already linked to this donation.");

        var ticket = new DonationFiscalTicket(donation, command.Code, command.Number, command.IssuedOn, clock.GetUtcNow());
        if (await tickets.NumberInUseAsync(current.Scope, ticket.Code, ticket.Number, ct))
            throw new BusinessConflictException("The fiscal ticket is already linked to another donation in this workspace.");
        tickets.Add(ticket);
        mutations.Record(current, command.OperationId, action, command, ticket.Id, 1);
        return View(ticket);
    }

    private static DonationFiscalTicketView View(DonationFiscalTicket x) =>
        new(x.Id, x.DonationId, x.Code, x.Number, x.IssuedOn, x.LinkedAtUtc);
}
