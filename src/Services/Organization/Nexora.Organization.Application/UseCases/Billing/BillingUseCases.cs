using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public sealed partial class BillingUseCases(IWorkspaceRepository workspaces, IApplicationAuthorization authorization, AccountMapping accounts,
    IBillingRepository billing, IBillingCounters counters, BillingEntitlements entitlements, TimeProvider clock)
{
    public async Task<BillingView> GetAsync(Guid workspaceId, ActorContext actor, CancellationToken cancellationToken)
    {
        var (workspace, identity) = await AuthorizedAsync(workspaceId, actor, WorkspacePermissions.BillingRead, cancellationToken);
        var now = clock.GetUtcNow();
        var subscription = await billing.FindSubscriptionAsync(BillingEntitlements.Owner(workspace), cancellationToken);
        var plan = entitlements.Effective(subscription, now);
        var usage = await entitlements.UsageAsync(workspace, subscription, plan, cancellationToken);
        var invoices = subscription is null ? [] : await billing.ListInvoicesAsync(subscription.Id, cancellationToken);
        var canManage = workspace.AllowsGovernanceOperation(identity, WorkspacePermissions.BillingManage);
        return Build(workspace, subscription, plan, usage, invoices, canManage);
    }

    public async Task<PlanQuoteView> QuoteAsync(Guid workspaceId, string planCode, ActorContext actor, CancellationToken cancellationToken)
    {
        var (workspace, _) = await AuthorizedAsync(workspaceId, actor, WorkspacePermissions.BillingManage, cancellationToken);
        var plan = BillingPlans.Find(planCode) ?? throw new BusinessConflictException("未知套餐。");
        var now = clock.GetUtcNow();
        var subscription = await billing.FindSubscriptionAsync(BillingEntitlements.Owner(workspace), cancellationToken);
        var current = entitlements.Effective(subscription, now);
        var quote = BillingProration.Quote(subscription, plan, now);
        return new(plan.Code, plan.Name, plan.MonthlyPriceCents, plan.Currency, current.Code, current.Name,
            subscription?.Status ?? SubscriptionStatuses.Active, quote.Prorated, quote.ChargeCents, quote.CreditCents,
            quote.AmountDueCents, quote.RemainingDays, now, quote.PeriodEndUtc);
    }

    public async Task<BillingOutcome<BillingView>> SelectPlanAsync(SelectBillingPlan command, CancellationToken cancellationToken)
    {
        var (workspace, identity) = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.BillingManage, cancellationToken);
        var plan = BillingPlans.Find(command.PlanCode) ?? throw new BusinessConflictException("未知套餐。");
        var now = clock.GetUtcNow();
        var subscription = await entitlements.EnsureSubscriptionAsync(workspace, cancellationToken);
        var invoices = await billing.ListInvoicesAsync(subscription.Id, cancellationToken);
        if (subscription.OperationId == command.OperationId) return new(Build(workspace, subscription, plan, null, invoices, true), null);
        if (plan.Code == BillingPlans.Free)
        {
            subscription.Cancel(command.OperationId, now);
            foreach (var pending in invoices) pending.Void();
            return new(await ViewAsync(workspace, identity, subscription, invoices, cancellationToken),
                new(workspace.TenantId, workspace.Id, "billing.plan.changed", subscription.Id, subscription.Version));
        }
        var current = subscription.EffectivePlan();
        if (current.Code == plan.Code && subscription.Status is SubscriptionStatuses.Active or SubscriptionStatuses.Trial
            && subscription.PeriodEndUtc > now)
            return new(await ViewAsync(workspace, identity, subscription, invoices, cancellationToken), null);
        var reference = string.IsNullOrWhiteSpace(command.PaymentReference) ? null : command.PaymentReference.Trim();
        var quote = BillingProration.Quote(subscription, plan, now);
        var paid = reference is not null || quote.AmountDueCents == 0;
        subscription.Select(plan, !paid, command.OperationId, now, quote.Prorated ? quote.PeriodEndUtc : null);
        var invoice = BillingInvoice.Issue(subscription.Id, workspace.Id, plan, paid, command.OperationId, reference, now,
            quote.AmountDueCents);
        billing.AddInvoice(invoice);
        invoices = [.. invoices, invoice];
        return new(await ViewAsync(workspace, identity, subscription, invoices, cancellationToken),
            new(workspace.TenantId, workspace.Id, paid ? "billing.plan.activated" : "billing.trial.started", invoice.Id, subscription.Version));
    }

    public async Task<BillingOutcome<BillingView>> PayInvoiceAsync(PayBillingInvoice command, CancellationToken cancellationToken)
    {
        var (workspace, identity) = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.BillingManage, cancellationToken);
        var subscription = await entitlements.EnsureSubscriptionAsync(workspace, cancellationToken);
        var invoice = await billing.FindInvoiceAsync(command.InvoiceId, cancellationToken) ?? throw new ResourceNotFoundException();
        if (invoice.BillingAccountId != subscription.Id || invoice.WorkspaceId != workspace.Id) throw new ResourceNotFoundException();
        if (invoice.CheckoutSubscriptionVersion is not null)
            throw new BusinessConflictException("请继续原测试结账以确认付款。");
        if (string.IsNullOrWhiteSpace(command.Reference)) throw new ArgumentException("付款参考号不能为空。");
        var now = clock.GetUtcNow();
        var invoices = await billing.ListInvoicesAsync(subscription.Id, cancellationToken);
        if (invoice.PaymentOperationId == command.OperationId) return new(await ViewAsync(workspace, identity, subscription, invoices, cancellationToken), null);
        if (invoice.Status == InvoiceStatuses.Void) throw new BusinessConflictException("账单已作废。");
        if (invoice.Status == InvoiceStatuses.Paid) throw new IdempotencyConflictException();
        invoice.MarkPaid(command.OperationId, command.Reference.Trim(), now);
        var plan = BillingPlans.Find(invoice.PlanCode) ?? BillingPlans.FreePlan;
        subscription.Select(plan, false, command.OperationId, now);
        return new(await ViewAsync(workspace, identity, subscription, invoices, cancellationToken),
            new(workspace.TenantId, workspace.Id, "billing.invoice.paid", invoice.Id, subscription.Version));
    }

    public async Task<BillingOutcome<BillingView>> CancelSubscriptionAsync(CancelBillingSubscription command, CancellationToken cancellationToken)
    {
        var (workspace, identity) = await AuthorizedAsync(command.WorkspaceId, command.Actor, WorkspacePermissions.BillingManage, cancellationToken);
        var subscription = await billing.FindSubscriptionAsync(BillingEntitlements.Owner(workspace), cancellationToken);
        if (subscription is null || subscription.Status == SubscriptionStatuses.Canceled)
            throw new BusinessConflictException("当前没有可取消的订阅。");
        var invoices = await billing.ListInvoicesAsync(subscription.Id, cancellationToken);
        if (subscription.OperationId == command.OperationId) return new(await ViewAsync(workspace, identity, subscription, invoices, cancellationToken), null);
        var now = clock.GetUtcNow();
        subscription.Cancel(command.OperationId, now);
        foreach (var invoice in invoices) invoice.Void();
        return new(await ViewAsync(workspace, identity, subscription, invoices, cancellationToken),
            new(workspace.TenantId, workspace.Id, "billing.subscription.canceled", subscription.Id, subscription.Version));
    }

    public async Task<DocumentReservationView> ReserveDocumentAsync(ReserveBillingDocuments command, CancellationToken cancellationToken)
    {
        if (command.Count is < 1 or > 100) throw new ArgumentException("单据数量必须在 1 到 100 之间。");
        var workspace = await workspaces.FindAsync(command.WorkspaceId, cancellationToken) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(command.Actor, new(workspace.TenantId, workspace.Id), WorkspacePermissions.Read, cancellationToken);
        var subscription = await entitlements.EnsureSubscriptionAsync(workspace, cancellationToken);
        var now = clock.GetUtcNow();
        var month = BillingEntitlements.Month(now);
        var plan = entitlements.Effective(subscription, now);
        var existing = await billing.FindReservationAsync(command.OperationId, cancellationToken);
        if (existing is not null)
            return new(workspace.Id, command.OperationId, existing.Count,
                await counters.CountDocumentsAsync(subscription.Id, month, cancellationToken), plan.Limits.DocumentsPerMonth, true);
        var used = await counters.CountDocumentsAsync(subscription.Id, month, cancellationToken);
        entitlements.EnsureDocumentQuota(plan, used, command.Count);
        var reservation = BillingUsageReservation.Record(command.OperationId, subscription.Id, month, command.Count, now);
        var replay = await billing.TryReserveAsync(reservation, cancellationToken);
        if (replay is not null)
            return new(workspace.Id, command.OperationId, replay.Count,
                await counters.CountDocumentsAsync(subscription.Id, month, cancellationToken), plan.Limits.DocumentsPerMonth, true);
        if (!await billing.TryIncrementUsageAsync(subscription.Id, month, command.Count, plan.Limits.DocumentsPerMonth, cancellationToken))
            throw new PlanLimitExceededException("documents", plan.Limits.DocumentsPerMonth, used);
        return new(workspace.Id, command.OperationId, command.Count, used + command.Count, plan.Limits.DocumentsPerMonth, false);
    }

    private async Task<BillingView> ViewAsync(Workspace workspace, IdentityReference identity, WorkspaceSubscription? subscription,
        IReadOnlyList<BillingInvoice> invoices, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow();
        var plan = entitlements.Effective(subscription, now);
        var usage = await entitlements.UsageAsync(workspace, subscription, plan, cancellationToken);
        return Build(workspace, subscription, plan, usage, invoices, workspace.AllowsGovernanceOperation(identity, WorkspacePermissions.BillingManage));
    }

    private static BillingView Build(Workspace workspace, WorkspaceSubscription? subscription, BillingPlan plan,
        BillingUsageView? usage, IReadOnlyList<BillingInvoice> invoices, bool canManage) =>
        new(workspace.Id,
            new(workspace.Id, plan.Code, subscription?.Status ?? SubscriptionStatuses.Active, plan.Code,
                subscription?.PeriodStartUtc, subscription?.PeriodEndUtc, subscription?.Version ?? 0, usage ?? new(0, plan.Limits.Workspaces, 0, plan.Limits.Members, 0, plan.Limits.DocumentsPerMonth, "")),
            invoices.Select(Invoice).ToList(),
            BillingPlans.All.Select(p => new PlanView(p.Code, p.Name, p.MonthlyPriceCents, p.Currency, p.Limits, p.Modules)).ToList(),
            canManage);

    private static InvoiceView Invoice(BillingInvoice invoice) => new(invoice.Id, invoice.PlanCode, invoice.Status,
        invoice.AmountCents, invoice.Currency, invoice.PaymentReference, invoice.IssuedAtUtc, invoice.PaidAtUtc);

    private async Task<(Workspace Workspace, IdentityReference Identity)> AuthorizedAsync(Guid workspaceId, ActorContext actor,
        string permission, CancellationToken cancellationToken)
    {
        await accounts.EnsureAsync(actor, cancellationToken);
        var workspace = await workspaces.FindAsync(workspaceId, cancellationToken) ?? throw new ResourceNotFoundException();
        await authorization.DemandAsync(actor, new(workspace.TenantId, workspace.Id), permission, cancellationToken);
        return (workspace, new(actor.Issuer, actor.Subject));
    }
}
