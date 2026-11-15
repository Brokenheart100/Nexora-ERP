using System.Net.Mail;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class ReceivableUseCases
{
    public async Task<DispatchView[]> DispatchesAsync(Guid workspace, Guid invoiceId, IInvoiceDispatches dispatches, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspace, ct);
        current.Demand(LedgerPermissions.Post);
        await InvoiceDocumentAsync(current.Scope, invoiceId, ct);
        return (await dispatches.ListAsync(current.Scope, invoiceId, ct)).Select(DispatchViewOf).ToArray();
    }

    public async Task<DispatchView> DispatchDetailAsync(Guid workspace, Guid invoiceId, Guid dispatchId, IInvoiceDispatches dispatches, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspace, ct);
        current.Demand(LedgerPermissions.Post);
        await InvoiceDocumentAsync(current.Scope, invoiceId, ct);
        var dispatch = await DispatchAsync(current.Scope, dispatchId, dispatches, ct);
        if (dispatch.InvoiceId != invoiceId) throw new ResourceNotFoundException();
        return DispatchViewOf(dispatch);
    }

    public async Task<(DispatchView, DeliverInvoiceMail?)> QueueMailAsync(QueueInvoiceMail command, IInvoiceDispatches dispatches, CancellationToken ct)
    {
        const string action = "invoice.mail-queued";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return (DispatchViewOf(await DispatchAsync(current.Scope, replay.TargetId!.Value, dispatches, ct)), null);
        var invoice = await InvoiceDocumentAsync(current.Scope, command.InvoiceId, ct);
        var recipient = await RecipientAsync(current.Scope, invoice, command.Recipient, ct);
        var dispatch = new InvoiceDispatch(invoice, recipient, clock.GetUtcNow(), null);
        dispatches.Add(dispatch);
        mutations.Record(current, command.OperationId, action, command, dispatch.Id, dispatch.Version);
        return (DispatchViewOf(dispatch), DeliveryOf(dispatch));
    }

    public async Task<(DispatchView, DeliverInvoiceMail?)> DecideMailAsync(DecideInvoiceMail command, IInvoiceDispatches dispatches, CancellationToken ct)
    {
        const string action = "invoice.mail-decision";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return (DispatchViewOf(await DispatchAsync(current.Scope, replay.TargetId!.Value, dispatches, ct)), null);
        var dispatch = await DispatchAsync(current.Scope, command.Id, dispatches, ct);
        if (dispatch.Version != command.ExpectedVersion) throw new RevisionConflictException("The delivery state changed.");
        var now = clock.GetUtcNow();
        DeliverInvoiceMail? delivery = null;
        switch (command.Decision)
        {
            case "abandon":
                dispatch.Abandon(now);
                break;
            case "retry":
                var original = await InvoiceDocumentAsync(current.Scope, dispatch.InvoiceId, ct);
                await RecipientAsync(current.Scope, original, dispatch.Recipient, ct);
                dispatch.Retry(now);
                delivery = DeliveryOf(dispatch);
                break;
            case "resend":
                var invoice = await InvoiceDocumentAsync(current.Scope, dispatch.InvoiceId, ct);
                var recipient = await RecipientAsync(current.Scope, invoice, dispatch.Recipient, ct);
                var replacement = new InvoiceDispatch(invoice, recipient, now, dispatch.Id);
                dispatch.MarkResent(replacement.Id, now);
                dispatches.Add(replacement);
                dispatch = replacement;
                delivery = DeliveryOf(dispatch);
                break;
            default: throw new ArgumentException("Unknown delivery decision.");
        }
        mutations.Record(current, command.OperationId, action, command, dispatch.Id, dispatch.Version);
        return (DispatchViewOf(dispatch), delivery);
    }

    public async Task<DispatchStart> StartMailAsync(DeliverInvoiceMail command, IChartStore chart, IInvoiceDispatches dispatches, CancellationToken ct)
    {
        var scope = new ResourceScope(command.TenantId, command.WorkspaceId);
        await chart.LockBookAsync(scope, ct);
        var dispatch = await DispatchAsync(scope, command.Id, dispatches, ct);
        if (!dispatch.Start(command.Attempt, clock.GetUtcNow())) return new(null);
        var invoice = await InvoiceDocumentAsync(scope, dispatch.InvoiceId, ct);
        if (invoice.JournalId != dispatch.JournalId) throw new LedgerRuleException("The invoice no longer matches the delivery.");
        return new(new(dispatch.Recipient, invoice.Terms), dispatch.LeaseUntilUtc);
    }

    public async Task FinishMailAsync(DeliverInvoiceMail command, DispatchOutcome? outcome, IChartStore chart, IInvoiceDispatches dispatches, CancellationToken ct)
    {
        var scope = new ResourceScope(command.TenantId, command.WorkspaceId);
        await chart.LockBookAsync(scope, ct);
        var dispatch = await DispatchAsync(scope, command.Id, dispatches, ct);
        var now = clock.GetUtcNow();
        if (outcome is null) dispatch.Expire(command.Attempt, now);
        else dispatch.Finish(command.Attempt, outcome.State, outcome.Detail, now);
    }

    private async Task<string> RecipientAsync(ResourceScope scope, CustomerDocument invoice, string? email, CancellationToken ct)
    {
        email = email?.Trim();
        if (email is not { Length: <= 254 } || !MailAddress.TryCreate(email, out var address) || address.Address != email)
            throw new ArgumentException("Choose a valid customer contact email.");
        var customer = await references.CustomerAsync(scope.WorkspaceId, invoice.Terms.CustomerId, ct);
        return customer.Emails.SingleOrDefault(x => x.Equals(email, StringComparison.OrdinalIgnoreCase)) ?? throw new AccessDeniedException();
    }

    private static async Task<InvoiceDispatch> DispatchAsync(ResourceScope scope, Guid id, IInvoiceDispatches dispatches, CancellationToken ct) =>
        await dispatches.FindAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
    private static DeliverInvoiceMail DeliveryOf(InvoiceDispatch x) => new(x.TenantId, x.WorkspaceId, x.Id, x.Attempt);
    private static DispatchView DispatchViewOf(InvoiceDispatch x) => new(x.Id, x.InvoiceId, x.Recipient,
        x.State.ToString().ToLowerInvariant(), x.Attempt, x.Version, x.PreviousId, x.ResentAsId, x.UpdatedAtUtc, x.Detail);
}
