using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Contracts;
using Wolverine;

namespace Nexora.Purchasing.Infrastructure;

public sealed class ReceiptProcess : Saga
{
    private ReceiptProcess() { }
    public ReceiptProcess(Guid id, Guid workspaceId, Guid tenantId, Guid orderId)
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

    public Task Handle(ReceiptProgressV1 progress, PurchaseReceiptUseCases service, CancellationToken ct)
    {
        if (progress.Id != Id || progress.TenantId != TenantId || progress.WorkspaceId != WorkspaceId || progress.OrderId != OrderId)
            throw new BusinessConflictException("Receipt progress does not belong to this process.");
        return service.ApplyAsync(progress, ct);
    }
}
