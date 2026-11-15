using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;
using Nexora.Finance.Infrastructure;
using Nexora.Inventory.Domain;

namespace Nexora.Tests;

public sealed class P4SalesTests
{
    [Theory]
    [InlineData(-1, true)]
    [InlineData(0, false)]
    [InlineData(1, false)]
    public void Deadline_and_shipment_share_one_terminal_balance(int millisecondsFromExpiry, bool canShip)
    {
        var date = new DateOnly(2026, 1, 31);
        var expires = DateTimeOffset.UnixEpoch.AddMinutes(1);
        var receipt = new ReceiptTerms(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            2, Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), date, 10, 60, "CNY", 2);
        var shipment = new ShipmentTerms(receipt.TenantId, receipt.WorkspaceId, Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            2, receipt.WarehouseId, receipt.ItemId, receipt.UnitId, Guid.NewGuid(), date, 6, 100, "CNY", 2, expires, "商品", "客户");
        var pool = new CostPool(receipt);
        pool.Receive(receipt, 10, 600);
        Assert.True(pool.TryReserve(shipment.UnitId, shipment.Currency, shipment.Quantity));
        Assert.Throws<StockRuleException>(() => pool.Issue(5, 2));

        var reservation = new SalesReservation(shipment, held: true);
        var now = expires.AddMilliseconds(millisecondsFromExpiry);
        if (canShip) Assert.Equal(120m, reservation.Ship(pool, date, 2, now));
        else Assert.Throws<StockRuleException>(() => reservation.Ship(pool, date, 2, now));

        Assert.True(reservation.Release(pool));
        Assert.False(reservation.Release(pool));
        Assert.Equal(canShip ? 8m : 10m, pool.Quantity);
        Assert.Equal(pool.Quantity, pool.Available);
        Assert.Equal(0m, pool.Reserved);
        Assert.Throws<StockRuleException>(() => reservation.Ship(pool, date, 1, now));
    }

    [Fact]
    public void Split_invoice_uses_the_shipment_net_ceiling_and_restores_cancelled_capacity()
    {
        var fact = new ReceiptFact(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(),
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.Empty, 1, new(2026, 1, 31), -1, 0, "CNY", null,
            Sale: new(Guid.NewGuid(), "客户", "商品", 0.01m));
        var shipment = new ReceiptAccrual(fact);
        shipment.Complete(null, Guid.NewGuid());

        Assert.Equal(0.01m, shipment.ReserveInvoice(0.5m, 2));
        Assert.Equal(0m, shipment.ReserveInvoice(0.5m, 2));
        Assert.Throws<LedgerRuleException>(() => shipment.ReserveInvoice(0.1m, 2));
        shipment.ReleaseInvoice(0.5m, 0.01m);
        Assert.Equal(0.01m, shipment.ReserveInvoice(0.5m, 2));
        shipment.BillShipment(0.5m, 0.01m, 2);
        shipment.BillShipment(0.5m, 0m, 2);

        Assert.Equal(0.01m, shipment.InvoicePostedNet);
        Assert.Equal(0m, shipment.InvoiceReservedNet);
        Assert.Equal(0m, shipment.AvailableToInvoice);
    }

    [Fact]
    public async Task Buffered_return_can_find_its_source_before_the_accrual_transaction_commits()
    {
        var scope = new ResourceScope(Guid.NewGuid(), Guid.NewGuid());
        var fact = new ReceiptFact(Guid.NewGuid(), scope.TenantId, scope.WorkspaceId, Guid.NewGuid(), Guid.NewGuid(),
            Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), Guid.Empty, 1, new(2026, 1, 31), -1, -60, "CNY", null,
            Sale: new(Guid.NewGuid(), "客户", "商品", 100));
        var options = new DbContextOptionsBuilder<FinanceDbContext>().UseNpgsql("Host=127.0.0.1;Port=1;Database=unused;Timeout=1").Options;
        await using var db = new FinanceDbContext(options);
        var store = new TradeStore(db);
        var shipment = new ReceiptAccrual(fact);
        store.Add(shipment);
        shipment.Complete(Guid.NewGuid(), Guid.NewGuid());

        var source = await store.ReceiptAsync(scope, fact.Id, CancellationToken.None);
        Assert.Same(shipment, source);
        source!.RecordSalesReturn(1, 60);
        Assert.Equal(1m, shipment.ReturnedQuantity);
    }

    [Fact]
    public void Lost_smtp_acknowledgement_does_not_automatically_start_another_send()
    {
        var now = DateTimeOffset.UnixEpoch;
        var on = new DateOnly(2026, 1, 1);
        var book = new AccountingBook(Guid.NewGuid(), Guid.NewGuid(), false, Guid.NewGuid(), "CNY", on, 1, "test", "maker", now);
        var invoice = new CustomerDocument(book, new(CustomerDocumentKind.Invoice, "INV", on, Guid.NewGuid(), "客户", "CNY", 20),
            new("test", "maker"), now);
        invoice.Post(Guid.NewGuid(), 20);
        var dispatch = new InvoiceDispatch(invoice, "buyer@example.test", now, null);

        Assert.True(dispatch.Start(1, now));
        Assert.False(dispatch.Start(1, now));
        dispatch.Expire(1, now.AddMinutes(2));
        Assert.Equal(DispatchState.Unknown, dispatch.State);
        Assert.False(dispatch.Start(1, now.AddMinutes(2)));
        Assert.Throws<LedgerRuleException>(() => dispatch.Retry(now.AddMinutes(2)));
        dispatch.MarkResent(Guid.NewGuid(), now.AddMinutes(2));
        Assert.Throws<LedgerRuleException>(() => dispatch.MarkResent(Guid.NewGuid(), now.AddMinutes(2)));
    }
}
