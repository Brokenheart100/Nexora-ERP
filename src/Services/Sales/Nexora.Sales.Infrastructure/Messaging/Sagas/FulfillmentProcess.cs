using Nexora.BuildingBlocks.Application;
using Nexora.Sales.Application;
using Nexora.Sales.Contracts;
using Wolverine;

namespace Nexora.Sales.Infrastructure;

public sealed class FulfillmentProcess : Saga
{
    private FulfillmentProcess() { }
    public FulfillmentProcess(Guid id, Guid workspaceId, Guid tenantId, Guid orderId)
    {
        Id = id;
        WorkspaceId = workspaceId;
        TenantId = tenantId;
        OrderId = orderId;
    }

    public Guid Id { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid OrderId { get; private set; }

    public Task Handle(FulfillmentProgressV1 progress, SalesFulfillmentUseCases service, CancellationToken ct)
    {
        if (progress.Id != Id || progress.TenantId != TenantId || progress.WorkspaceId != WorkspaceId || progress.OrderId != OrderId)
            throw new BusinessConflictException("Fulfillment progress does not belong to this process.");
        return service.ApplyAsync(progress, ct);
    }
}
