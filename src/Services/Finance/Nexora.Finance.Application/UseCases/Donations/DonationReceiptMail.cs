using System.Net.Mail;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class DonationReceiptMail(TradeAccess access, DonationReceipts receipts, ITradePartnerAuthority partners,
    IInvoiceDispatches dispatches, FinanceMutation mutations, TimeProvider clock)
{
    public async Task<DonationDispatchView[]> ListAsync(Guid workspaceId, Guid donationId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        current.Demand(LedgerPermissions.Post);
        await receipts.FindAsync(current.Scope, donationId, ct);
        return (await dispatches.ListAsync(current.Scope, donationId, true, ct)).Select(View).ToArray();
    }

    public async Task<DonationDispatchView> DetailAsync(Guid workspaceId, Guid donationId, Guid dispatchId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        current.Demand(LedgerPermissions.Post);
        return View(await FindAsync(current.Scope, donationId, dispatchId, ct));
    }

    public async Task<(DonationDispatchView, DeliverInvoiceMail?)> QueueAsync(QueueDonationReceiptMail command, CancellationToken ct)
    {
        const string action = "donation.mail-queued";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null)
            return (View(await FindAsync(current.Scope, command.DonationId, replay.TargetId!.Value, ct)), null);
        var donation = await receipts.FindAsync(current.Scope, command.DonationId, ct);
        var recipient = await RecipientAsync(current.Scope, donation, command.Recipient, ct);
        var dispatch = new InvoiceDispatch(donation, recipient, clock.GetUtcNow(), null);
        dispatches.Add(dispatch);
        mutations.Record(current, command.OperationId, action, command, dispatch.Id, dispatch.Version);
        return (View(dispatch), Delivery(dispatch));
    }

    public async Task<(DonationDispatchView, DeliverInvoiceMail?)> DecideAsync(DecideDonationReceiptMail command, CancellationToken ct)
    {
        const string action = "donation.mail-decision";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null)
            return (View(await FindAsync(current.Scope, command.DonationId, replay.TargetId!.Value, ct)), null);
        var dispatch = await FindAsync(current.Scope, command.DonationId, command.DispatchId, ct);
        if (dispatch.Version != command.ExpectedVersion) throw new RevisionConflictException("The delivery state changed.");
        var now = clock.GetUtcNow();
        DeliverInvoiceMail? delivery = null;
        if (command.Decision == "abandon")
        {
            dispatch.Abandon(now);
        }
        else
        {
            var donation = await receipts.FindAsync(current.Scope, command.DonationId, ct);
            var recipient = await RecipientAsync(current.Scope, donation, dispatch.Recipient, ct);
            switch (command.Decision)
            {
                case "retry":
                    dispatch.Retry(now);
                    break;
                case "resend":
                    var replacement = new InvoiceDispatch(donation, recipient, now, dispatch.Id);
                    dispatch.MarkResent(replacement.Id, now);
                    dispatches.Add(replacement);
                    dispatch = replacement;
                    break;
                default: throw new ArgumentException("Unknown delivery decision.");
            }
            delivery = Delivery(dispatch);
        }

        mutations.Record(current, command.OperationId, action, command, dispatch.Id, dispatch.Version);
        return (View(dispatch), delivery);
    }

    private async Task<InvoiceDispatch> FindAsync(ResourceScope scope, Guid donationId, Guid dispatchId, CancellationToken ct) =>
        await dispatches.FindAsync(scope, dispatchId, ct) is { IsDonation: true } dispatch && dispatch.DocumentId == donationId
            ? dispatch : throw new ResourceNotFoundException();

    private async Task<string> RecipientAsync(ResourceScope scope, TradeDocument donation, string? email, CancellationToken ct)
    {
        if (donation.ReversedById is not null) throw new LedgerRuleException("A reversed donation cannot be dispatched.");
        email = email?.Trim();
        if (email is not { Length: <= 254 } || !MailAddress.TryCreate(email, out var address) || address.Address != email)
            throw new ArgumentException("Choose a valid donor contact email.");
        var contacts = await partners.DonorEmailsAsync(scope.WorkspaceId, donation.Terms.PartnerId!.Value, ct);
        return contacts.FirstOrDefault(x => x.Equals(email, StringComparison.OrdinalIgnoreCase)) ?? throw new AccessDeniedException();
    }

    private static DeliverInvoiceMail Delivery(InvoiceDispatch x) => new(x.TenantId, x.WorkspaceId, x.Id, x.Attempt);

    private static DonationDispatchView View(InvoiceDispatch x) => new(x.Id, x.DocumentId, x.Recipient,
        x.State.ToString().ToLowerInvariant(), x.Attempt, x.Version, x.PreviousId, x.ResentAsId, x.UpdatedAtUtc, x.Detail);
}
