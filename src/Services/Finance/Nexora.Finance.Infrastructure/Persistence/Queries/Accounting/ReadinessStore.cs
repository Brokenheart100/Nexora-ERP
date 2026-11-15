using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

public sealed class ReadinessStore(FinanceDbContext db) : IReadinessStore
{
    private IQueryable<TradeDocument> Bills(ResourceScope scope) => db.Set<TradeDocument>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
    private IQueryable<CustomerDocument> Invoices(ResourceScope scope) => db.Set<CustomerDocument>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);
    private IQueryable<ReceiptAccrual> Costs(ResourceScope scope) => db.Set<ReceiptAccrual>()
        .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId);

    public async Task<int> PostedDocumentsWithoutJournalAsync(ResourceScope scope, CancellationToken ct) =>
        await Bills(scope).AsNoTracking().CountAsync(x => x.State == TradeState.Posted && x.JournalId == null, ct)
        + await Invoices(scope).AsNoTracking().CountAsync(x => x.State == CustomerDocumentState.Posted && x.JournalId == null, ct);

    public async Task<ReadinessDocument[]> MissingDocumentsAsync(ResourceScope scope, int limit, CancellationToken ct)
    {
        var bills = await Bills(scope).AsNoTracking()
            .Where(x => x.State == TradeState.Posted && x.JournalId == null).Take(limit).ToArrayAsync(ct);
        var invoices = await Invoices(scope).AsNoTracking()
            .Where(x => x.State == CustomerDocumentState.Posted && x.JournalId == null).Take(limit).ToArrayAsync(ct);
        return bills.Select(x => new ReadinessDocument(x.Id, "bill", x.Number, x.Terms.On, x.Total))
            .Concat(invoices.Select(x => new ReadinessDocument(x.Id, "invoice", x.Number, x.Terms.On, x.Terms.Total)))
            .OrderBy(x => x.On).ThenBy(x => x.Number, StringComparer.Ordinal).Take(limit).ToArray();
    }

    public Task<int> PendingCostsAsync(ResourceScope scope, CancellationToken ct) =>
        Costs(scope).AsNoTracking().CountAsync(x => !x.Posted, ct);

    public async Task<PendingCost[]> PendingCostListAsync(ResourceScope scope, int limit, CancellationToken ct)
    {
        var rows = await Costs(scope).AsNoTracking().Where(x => !x.Posted).ToArrayAsync(ct);
        return rows.Select(x => new PendingCost(x.Id, x.Fact.On, Kind(x), x.Fact.Cost,
                x.PendingReason ?? "Not posted."))
            .OrderBy(x => x.On).ThenBy(x => x.Id).Take(limit).ToArray();
    }

    public Task<ReceiptAccrual[]> PendingAccrualsAsync(ResourceScope scope, CancellationToken ct) =>
        Costs(scope).Where(x => !x.Posted).ToArrayAsync(ct);

    private static string Kind(ReceiptAccrual cost) => cost.Fact.Stock is not null ? "stock"
        : cost.IsSales ? "shipment" : "receipt";
}
