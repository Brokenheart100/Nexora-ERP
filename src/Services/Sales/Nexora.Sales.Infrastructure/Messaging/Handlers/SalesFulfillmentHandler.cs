using Nexora.Sales.Application;
using Nexora.Sales.Contracts;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Sales.Infrastructure;

public static class SalesFulfillmentHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(FulfillmentBatchChange, FulfillmentGrantedV1?)> Handle(IssueFulfillmentPermit command, SalesDbContext db,
        SalesFulfillmentUseCases service, CancellationToken ct) => service.IssueAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(PermitChange, FulfillmentFenceV1?)> Handle(FenceFulfillmentPermit command, SalesDbContext db,
        SalesFulfillmentUseCases service, CancellationToken ct) => service.FenceAsync(command, ct);
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<SalesChange> Handle(CloseFulfilling command, SalesDbContext db,
        SalesFulfillmentUseCases service, CancellationToken ct) => service.CloseAsync(command, ct);
}
