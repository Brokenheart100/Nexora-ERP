using System.Globalization;
using Nexora.Finance.Application;
using Nexora.Finance.Contracts.Opening;
using Wolverine;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class OpeningSubledgerHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<OpeningSubledgerView> Handle(SubmitOpeningSubledger command, FinanceDbContext db,
        OpeningSubledgers service, CancellationToken ct) => service.SubmitAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<(OpeningSubledgerView, OpeningStockRequestedV1?)> Handle(DecideOpeningSubledger command,
        FinanceDbContext db, OpeningSubledgers service, CancellationToken ct)
    {
        var (batch, plan) = await service.DecideAsync(command, ct);
        return (batch, plan is null ? null : new(plan.BatchId, plan.TenantId, plan.WorkspaceId, plan.On, plan.Currency,
            plan.Rows.Select(row => new OpeningStockRowV1(row.Id, row.WarehouseId!.Value, row.ResourceId, row.UnitId!.Value,
                row.Quantity.ToString("0.######", CultureInfo.InvariantCulture), row.Amount.ToString("0.######", CultureInfo.InvariantCulture))).ToArray()));
    }

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<OutgoingMessages> Handle(OpeningStockAcknowledgedV1 fact, FinanceDbContext db,
        OpeningSubledgers service, CancellationToken ct)
    {
        var outgoing = new OutgoingMessages();
        foreach (var resume in await service.FinalizeAsync(fact.TenantId, fact.WorkspaceId, fact.BatchId, fact.Rejection, ct))
            outgoing.Add(resume);
        return outgoing;
    }

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task Handle(ResumeCostsAfterOpening command, FinanceDbContext db, TradeUseCases service, CancellationToken ct) =>
        service.ResumeAfterOpeningAsync(command, ct);
}
