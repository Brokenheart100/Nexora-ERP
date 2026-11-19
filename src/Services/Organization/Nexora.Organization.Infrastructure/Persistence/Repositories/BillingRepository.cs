using Microsoft.EntityFrameworkCore;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class BillingRepository(OrganizationDbContext db) : IBillingRepository
{
    public async Task LockLocalCheckoutAsync(IdentityReference owner, CancellationToken ct)
    {
        var key = $"nexora-local-billing:{owner.Issuer.Length}:{owner.Issuer}{owner.Subject}";
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);
    }
    public Task<WorkspaceSubscription?> FindSubscriptionAsync(IdentityReference owner, CancellationToken cancellationToken) =>
        db.Subscriptions.SingleOrDefaultAsync(x => x.Issuer == owner.Issuer && x.Subject == owner.Subject, cancellationToken);

    public void AddSubscription(WorkspaceSubscription subscription) => db.Subscriptions.Add(subscription);

    public Task<BillingInvoice?> FindInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken) =>
        db.Invoices.SingleOrDefaultAsync(x => x.Id == invoiceId, cancellationToken);

    public void AddInvoice(BillingInvoice invoice) => db.Invoices.Add(invoice);

    public async Task<IReadOnlyList<BillingInvoice>> ListInvoicesAsync(Guid billingAccountId, CancellationToken cancellationToken) =>
        await db.Invoices.Where(x => x.BillingAccountId == billingAccountId)
            .OrderByDescending(x => x.IssuedAtUtc).ThenByDescending(x => x.Id).ToListAsync(cancellationToken);

    public Task<BillingUsageReservation?> FindReservationAsync(Guid operationId, CancellationToken cancellationToken) =>
        db.BillingUsageReservations.SingleOrDefaultAsync(x => x.OperationId == operationId, cancellationToken);

    public async Task<BillingUsageReservation?> TryReserveAsync(BillingUsageReservation reservation, CancellationToken cancellationToken)
    {
        var inserted = await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO organization.billing_usage_reservations ("OperationId", "BillingAccountId", "PeriodMonth", "Count", "RecordedAtUtc")
            VALUES ({reservation.OperationId}, {reservation.BillingAccountId}, {reservation.PeriodMonth}, {reservation.Count}, {reservation.RecordedAtUtc})
            ON CONFLICT ("OperationId") DO NOTHING
            """, cancellationToken);
        return inserted == 0 ? await FindReservationAsync(reservation.OperationId, cancellationToken) : null;
    }

    public async Task<bool> TryIncrementUsageAsync(Guid billingAccountId, DateOnly periodMonth, int count, int limit, CancellationToken cancellationToken)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO organization.billing_document_usage ("BillingAccountId", "PeriodMonth", "Documents", "Version")
            VALUES ({billingAccountId}, {periodMonth}, 0, 0)
            ON CONFLICT ("BillingAccountId", "PeriodMonth") DO NOTHING
            """, cancellationToken);
        var updated = await db.Database.ExecuteSqlInterpolatedAsync($"""
            UPDATE organization.billing_document_usage
            SET "Documents" = "Documents" + {count}, "Version" = "Version" + 1
            WHERE "BillingAccountId" = {billingAccountId} AND "PeriodMonth" = {periodMonth}
              AND "Documents" + {count} <= {limit}
            """, cancellationToken);
        return updated > 0;
    }
}
