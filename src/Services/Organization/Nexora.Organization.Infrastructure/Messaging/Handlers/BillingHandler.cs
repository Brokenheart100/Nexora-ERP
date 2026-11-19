using Nexora.BuildingBlocks.Application;
using Nexora.Organization.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Organization.Infrastructure.Messaging;

public static class BillingHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<LocalCheckoutIntent> Handle(BeginLocalCheckout command, OrganizationDbContext db,
        BillingUseCases useCases, ILocalCheckoutTicket ticket, TimeProvider clock, CancellationToken ct)
    {
        var outcome = await useCases.BeginLocalCheckoutAsync(command, ticket, ct);
        Record(outcome, command.Actor, db, clock);
        return outcome.Result;
    }

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<BillingView> Handle(ConfirmLocalCheckout command, OrganizationDbContext db,
        BillingUseCases useCases, ILocalCheckoutTicket ticket, TimeProvider clock, CancellationToken ct)
    {
        var outcome = await useCases.ConfirmLocalCheckoutAsync(command, ticket, ct);
        Record(outcome, command.Actor, db, clock);
        return outcome.Result;
    }
    [Transactional]
    public static async Task<BillingView> Handle(SelectBillingPlan command, OrganizationDbContext db, BillingUseCases useCases,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        var outcome = await useCases.SelectPlanAsync(command, cancellationToken);
        Record(outcome, command.Actor, db, clock);
        return outcome.Result;
    }

    [Transactional]
    public static async Task<BillingView> Handle(PayBillingInvoice command, OrganizationDbContext db, BillingUseCases useCases,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        var outcome = await useCases.PayInvoiceAsync(command, cancellationToken);
        Record(outcome, command.Actor, db, clock);
        return outcome.Result;
    }

    [Transactional]
    public static async Task<BillingView> Handle(CancelBillingSubscription command, OrganizationDbContext db, BillingUseCases useCases,
        TimeProvider clock, CancellationToken cancellationToken)
    {
        var outcome = await useCases.CancelSubscriptionAsync(command, cancellationToken);
        Record(outcome, command.Actor, db, clock);
        return outcome.Result;
    }

    [Transactional]
    public static async Task<DocumentReservationView> Handle(ReserveBillingDocuments command, BillingUseCases useCases,
        CancellationToken cancellationToken) => await useCases.ReserveDocumentAsync(command, cancellationToken);

    private static void Record<T>(BillingOutcome<T> outcome, ActorContext actor, OrganizationDbContext db, TimeProvider clock)
    {
        if (outcome.Audit is not { } audit) return;
        db.Audits.Add(new(Guid.CreateVersion7(), audit.TenantId, audit.WorkspaceId, audit.Action,
            actor.Issuer, actor.Subject, clock.GetUtcNow(), audit.TargetId, audit.Version));
    }
}
