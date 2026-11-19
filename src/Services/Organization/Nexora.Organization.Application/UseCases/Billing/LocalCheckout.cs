using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed record BeginLocalCheckout(Guid WorkspaceId, Guid OperationId, string PlanCode, int ExpectedAmountCents,
    bool UseSavedCard, ActorContext Actor) : IUserGovernanceCommand;
public sealed record ConfirmLocalCheckout(Guid WorkspaceId, Guid InvoiceId, string Ticket, bool SaveCard, ActorContext Actor)
    : IUserGovernanceCommand;
public sealed record LocalCheckoutIntent(Guid InvoiceId, string PlanCode, int AmountCents, string Currency, bool UsesSavedCard, string Ticket);
public sealed record LocalCheckoutState(bool HasSavedCard, LocalCheckoutIntent? Pending);

public sealed partial class BillingUseCases
{
    public async Task<LocalCheckoutState> LocalCheckoutAsync(Guid workspaceId, ActorContext actor, ILocalCheckoutTicket ticket, CancellationToken ct)
    {
        var (workspace, _) = await AuthorizedAsync(workspaceId, actor, WorkspacePermissions.BillingManage, ct);
        var subscription = await billing.FindSubscriptionAsync(BillingEntitlements.Owner(workspace), ct);
        if (subscription is null) return new(false, null);
        var pending = (await billing.ListInvoicesAsync(subscription.Id, ct))
            .FirstOrDefault(x => x.WorkspaceId == workspace.Id && x.Status == InvoiceStatuses.Pending
                && x.CheckoutSubscriptionVersion == subscription.Version);
        return new(subscription.HasSavedTestCard, pending is null ? null : LocalIntent(pending, ticket));
    }

    public async Task<BillingOutcome<LocalCheckoutIntent>> BeginLocalCheckoutAsync(BeginLocalCheckout command, ILocalCheckoutTicket ticket, CancellationToken ct)
    {
        var (workspace, _) = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.BillingManage, ct);
        var plan = BillingPlans.Find(command.PlanCode);
        if (plan is null || plan.Code == BillingPlans.Free || command.OperationId == Guid.Empty)
            throw new ArgumentException("请选择付费套餐和有效请求编号。");
        await billing.LockLocalCheckoutAsync(BillingEntitlements.Owner(workspace), ct);
        var subscription = await entitlements.EnsureSubscriptionAsync(workspace, ct);
        var invoices = await billing.ListInvoicesAsync(subscription.Id, ct);
        var replay = invoices.FirstOrDefault(x => x.OperationId == command.OperationId);
        if (replay is not null)
        {
            if (replay.CheckoutSubscriptionVersion is null || replay.WorkspaceId != workspace.Id
                || replay.PlanCode != plan.Code || replay.AmountCents != command.ExpectedAmountCents || replay.UsesSavedTestCard != command.UseSavedCard)
                throw new IdempotencyConflictException();
            return new(LocalIntent(replay, ticket), null);
        }
        if (command.UseSavedCard && !subscription.HasSavedTestCard)
            throw new BusinessConflictException("没有已保存的测试卡。");
        var now = clock.GetUtcNow();
        var quote = BillingProration.Quote(subscription, plan, now);
        if (quote.AmountDueCents != command.ExpectedAmountCents)
            throw new BusinessConflictException("费用已变化，请重新核对报价。");
        foreach (var pending in invoices.Where(x => x.WorkspaceId == workspace.Id && x.CheckoutSubscriptionVersion is not null
            && x.Status == InvoiceStatuses.Pending))
            pending.Void();
        var invoice = BillingInvoice.Issue(subscription.Id, workspace.Id, plan, false, command.OperationId, null, now, quote.AmountDueCents);
        invoice.StartLocalCheckout(subscription.Version, quote.Prorated ? quote.PeriodEndUtc : null, command.UseSavedCard);
        billing.AddInvoice(invoice);
        return new(LocalIntent(invoice, ticket), new(workspace.TenantId, workspace.Id, "billing.local_checkout.started", invoice.Id, subscription.Version));
    }

    public async Task<BillingOutcome<BillingView>> ConfirmLocalCheckoutAsync(ConfirmLocalCheckout command, ILocalCheckoutTicket ticket,
        CancellationToken ct)
    {
        var (workspace, identity) = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.BillingManage, ct);
        await billing.LockLocalCheckoutAsync(BillingEntitlements.Owner(workspace), ct);
        var subscription = await entitlements.EnsureSubscriptionAsync(workspace, ct);
        var invoice = await billing.FindInvoiceAsync(command.InvoiceId, ct) ?? throw new ResourceNotFoundException();
        if (invoice.WorkspaceId != workspace.Id || invoice.BillingAccountId != subscription.Id || invoice.CheckoutSubscriptionVersion is null)
            throw new ResourceNotFoundException();
        if (!ticket.Valid(invoice, command.Ticket)) throw new AccessDeniedException();
        var invoices = await billing.ListInvoicesAsync(subscription.Id, ct);
        if (invoice.Status == InvoiceStatuses.Paid)
            return new(await ViewAsync(workspace, identity, subscription, invoices, ct), null);
        var now = clock.GetUtcNow();
        if (invoice.Status != InvoiceStatuses.Pending || invoice.CheckoutSubscriptionVersion != subscription.Version
            || invoice.CheckoutPeriodEndUtc is { } end && end <= now)
            throw new BusinessConflictException("结账已失效，请重新确认报价。");
        invoice.MarkPaid(invoice.Id, $"local-{invoice.Id:N}", now);
        subscription.Select(BillingPlans.Find(invoice.PlanCode)!, false, invoice.Id, now, invoice.CheckoutPeriodEndUtc);
        if (command.SaveCard) subscription.SaveLocalTestCard();
        return new(await ViewAsync(workspace, identity, subscription, invoices, ct),
            new(workspace.TenantId, workspace.Id, "billing.local_checkout.paid", invoice.Id, subscription.Version));
    }

    private static LocalCheckoutIntent LocalIntent(BillingInvoice invoice, ILocalCheckoutTicket ticket) =>
        new(invoice.Id, invoice.PlanCode, invoice.AmountCents, invoice.Currency, invoice.UsesSavedTestCard, ticket.Sign(invoice));
}
