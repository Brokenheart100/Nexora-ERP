using Nexora.BuildingBlocks.Application;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Tests;

public sealed class PurchaseReceiptAuthorizationTests
{
    [Fact]
    public async Task Department_approver_can_manage_and_issue_for_the_order_department()
    {
        var store = new Store();
        var authority = new Authority(store.Order, store.DepartmentId);
        var service = new PurchaseReceiptUseCases(authority, store, store, TimeProvider.System);
        Assert.True((await service.ListAsync(store.Order.WorkspaceId, store.Order.Id, default)).CanManage);
        var (result, message) = await service.IssueAsync(store.Command(), default);
        Assert.NotNull(message);
        Assert.Equal(store.Permits.Single().Id, result.PermitId);
    }

    [Fact]
    public async Task Another_department_is_hidden_even_when_order_read_is_company_wide()
    {
        var store = new Store();
        var authority = new Authority(store.Order, Guid.NewGuid());
        var service = new PurchaseReceiptUseCases(authority, store, store, TimeProvider.System);
        Assert.False((await service.ListAsync(store.Order.WorkspaceId, store.Order.Id, default)).CanManage);
        await Assert.ThrowsAsync<ResourceNotFoundException>(() => service.IssueAsync(store.Command(), default));
        Assert.Empty(store.Permits);
    }

    [Fact]
    public async Task Replay_ignores_old_version_but_rechecks_current_order_scope()
    {
        var store = new Store();
        var authority = new Authority(store.Order, store.DepartmentId);
        var service = new PurchaseReceiptUseCases(authority, store, store, TimeProvider.System);
        var command = store.Command();
        var (first, _) = await service.IssueAsync(command, default);
        var (replayed, message) = await service.IssueAsync(command, default);
        Assert.Equal(first, replayed);
        Assert.Null(message);
        Assert.Single(store.Permits);
        authority.DepartmentId = Guid.NewGuid();
        await Assert.ThrowsAsync<ResourceNotFoundException>(() => service.IssueAsync(command, default));
        Assert.Single(store.Permits);
    }

    private sealed class Authority(PurchaseOrder order, Guid departmentId) : IPurchaseAuthority
    {
        public Guid DepartmentId { get; set; } = departmentId;
        public Task<PurchaseAccess> AccessAsync(Guid workspaceId, CancellationToken ct) => Task.FromResult(new PurchaseAccess(
            new(order.TenantId, order.WorkspaceId), new("test", "reviewer"), [PurchasePermissions.Read],
            [new ScopedPermission(PurchasePermissions.Approve, DepartmentId, null)]));
        public Task DemandWarehouseAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct) => Task.CompletedTask;
        public Task<PurchaseTerms> TermsAsync(ResourceScope scope, CancellationToken ct) => throw new NotSupportedException();
        public Task<SupplierReference> SupplierAsync(ResourceScope scope, Guid supplierId, CancellationToken ct) => throw new NotSupportedException();
        public Task<StockReference> StockAsync(ResourceScope scope, Guid itemId, CancellationToken ct) => throw new NotSupportedException();
    }

    private sealed class Store : IPurchaseOrders, IPurchaseReceipts
    {
        public Guid DepartmentId { get; } = Guid.NewGuid();
        public PurchaseOrder Order { get; }
        public List<ReceiptPermit> Permits { get; } = [];
        private readonly List<PurchaseAudit> _audits = [];
        public Store()
        {
            var maker = new PurchaseActor("test", "maker");
            var on = new DateOnly(2026, 1, 1);
            Order = PurchaseOrder.Start(Guid.NewGuid(), Guid.NewGuid(), "PO-SCOPED", new("CNY", 2, on), on,
                new(Guid.NewGuid(), "SUP", "Supplier", 1),
                [new(new(Guid.NewGuid(), "SKU", "Item", 1, Guid.NewGuid(), 1, Guid.NewGuid(), "PCS", 1), 10, 10)],
                null, maker, DateTimeOffset.UnixEpoch, DepartmentId);
            Order.Submit(maker);
            Order.Approve(new("test", "reviewer"), DateTimeOffset.UnixEpoch);
        }
        public IssueReceiptPermit Command() => new(Order.WorkspaceId, Guid.NewGuid(), Order.Id, Order.Version, Order.Lines.Single().Id, Guid.NewGuid(), "1");
        public Task<IReadOnlyList<PurchaseOrder>> PageAsync(PurchaseAccess access, PageWindow page, CancellationToken ct) => Task.FromResult<IReadOnlyList<PurchaseOrder>>([Order]);
        public Task<PurchaseOrder?> GetAsync(ResourceScope scope, Guid id, CancellationToken ct) => Task.FromResult<PurchaseOrder?>(id == Order.Id && scope.WorkspaceId == Order.WorkspaceId ? Order : null);
        public Task<PurchaseOrder?> LockAsync(ResourceScope scope, Guid id, CancellationToken ct) => GetAsync(scope, id, ct);
        public Task LockOperationAsync(PurchaseAccess current, Guid operationId, CancellationToken ct) => Task.CompletedTask;
        public Task<PurchaseAudit?> FindOperationAsync(PurchaseAccess current, Guid operationId, CancellationToken ct) => Task.FromResult(_audits.SingleOrDefault(audit => audit.OperationId == operationId && audit.Subject == current.Actor.Subject));
        public Task<ReceiptPermit[]> ListAsync(ResourceScope scope, Guid orderId, CancellationToken ct, PageWindow? page = null) => Task.FromResult(Permits.Where(permit => permit.OrderId == orderId).ToArray());
        public void Add(PurchaseOrder order) => throw new NotSupportedException();
        public void Add(PurchaseAudit audit) => _audits.Add(audit);
        public void Add(ReceiptPermit permit) => Permits.Add(permit);
    }
}
