using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class TradeUseCases
{
    public async Task<TradeChange> ProcessAsync(ProcessAccrual command, CancellationToken ct)
    {
        const string action = "trade.receipt.accrued";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Replay(replay);
        var receipt = await store.ReceiptAsync(current.Scope, command.ReceiptId, ct) ?? throw new ResourceNotFoundException();
        await AccrueAndContinueAsync(current.Scope, book, receipt, ct);
        if (!receipt.Posted) throw new LedgerRuleException(receipt.PendingReason!);
        return Record(current, command.OperationId, action, command, receipt.Id, 1);
    }

    public async Task ReceiveFactAsync(ReceiptFact fact, CancellationToken ct)
    {
        var scope = new ResourceScope(fact.TenantId, fact.WorkspaceId);
        var book = await chart.LockBookAsync(scope, ct) ?? throw new ResourceNotFoundException();
        var validDirection = fact.Stock is { } stock
            ? stock.OperationId != Guid.Empty && fact.Sale is null && fact.ReversesId is null && fact.AdjustmentForBillId is null
                && fact.Quantity != 0 && (fact.Cost == 0 || Math.Sign(fact.Quantity) == Math.Sign(fact.Cost))
            : fact.Sale is { } sale
            ? sale.CustomerId != Guid.Empty && sale.UnitPrice > 0 && fact.AdjustmentForBillId is null
                && (fact.Quantity < 0 && fact.Cost <= 0 && fact.ReversesId is null || fact.Quantity > 0 && fact.Cost >= 0 && fact.ReversesId is not null)
            : fact.Quantity switch
        {
            > 0 => fact.Cost >= 0 && fact.ReversesId is null && fact.AdjustmentForBillId is null,
            < 0 => fact.Cost <= 0 && fact.ReversesId is not null && fact.AdjustmentForBillId is null,
            _ => fact.ReversesId is null && fact.AdjustmentForBillId is not null
        };
        if (fact.Sequence < 1 || !validDirection || fact.Currency != book.BaseCurrency
            || Math.Round(fact.Cost, book.MinorUnits) != fact.Cost || Math.Round(fact.Quantity, 6) != fact.Quantity)
            throw new ArgumentException("Invalid receipt cost fact.");
        var existing = await store.ReceiptAsync(scope, fact.Id, ct);
        if (existing is not null && existing.Fact != fact) throw new LedgerRuleException("A receipt fact changed after delivery.");
        var receipt = existing ?? new ReceiptAccrual(fact);
        if (existing is null) store.Add(receipt);
        await AccrueAndContinueAsync(scope, book, receipt, ct);
    }

    private async Task AccrueAndContinueAsync(ResourceScope scope, AccountingBook book, ReceiptAccrual receipt, CancellationToken ct)
    {
        await AccrueAsync(scope, book, receipt, false, ct);
        // Bound work per delivery; an unresolved remainder can be processed from the cost workbench.
        for (var count = 0; receipt.Posted && count < 32; count++)
        {
            var next = await store.NextCostAsync(scope, receipt.Fact, ct);
            if (next is null) break;
            await AccrueAsync(scope, book, next, true, ct);
            receipt = next;
        }
    }

    private async Task AccrueAsync(ResourceScope scope, AccountingBook book, ReceiptAccrual receipt, bool predecessorConfirmed, CancellationToken ct)
    {
        if (receipt.Posted) return;
        var fact = receipt.Fact;
        var setup = await store.SetupAsync(scope, ct);
        var gate = await posting.GateAsync(scope, book, fact.On, ct);
        if (setup is null) { receipt.WaitFor("Configure trading accounts."); return; }
        if (gate is not null) { receipt.WaitFor(gate); return; }
        if (!predecessorConfirmed && !await store.PredecessorPostedAsync(fact, ct)) { receipt.WaitFor("Waiting for the preceding cost sequence."); return; }
        if (Math.Abs(fact.Cost) > 1_000_000_000_000m) { receipt.WaitFor("Receipt exceeds the journal line limit."); return; }
        if (fact.Stock is { } stock)
        {
            await AccrueStockAdjustmentAsync(scope, book, setup, receipt, stock, ct);
            return;
        }
        if (receipt.IsSales)
        {
            await AccrueSalesAsync(scope, book, setup.InventoryAccountId, receipt, ct);
            return;
        }
        var accounts = await ledger.AccountsAsync(scope, [setup.InventoryAccountId, setup.AccrualAccountId], ct);
        if (accounts.Length != 2 || accounts.Any(x => x.IsArchived || x.Purpose != AccountPurpose.Control))
        { receipt.WaitFor("Receipt posting accounts are unavailable."); return; }
        var lines = new List<PostLine> { new(setup.InventoryAccountId, fact.Cost) };
        if (fact.ReversesId is Guid originalId)
        {
            var original = await OriginalAsync(scope, fact, originalId, ct);
            if (-fact.Quantity > original.AvailableToBill)
            { receipt.WaitFor("The return requires a supplier credit against the original bill."); return; }
            var cost = original.ReturnUnbilled(-fact.Quantity, book.MinorUnits);
            lines.Add(new(original.AccrualAccountId!.Value, cost));
            lines.Add(new(setup.VarianceAccountId, -fact.Cost - cost));
        }
        else if (fact.AdjustmentForBillId is Guid billId)
        {
            var bill = await DocumentAsync(scope, billId, ct);
            var matched = bill.BillMatches?.SingleOrDefault(x => x.Id == fact.Id);
            var variance = matched?.Variance ?? (bill.BillMatches is null && billId == fact.Id ? bill.PurchaseVariance : 0);
            if (bill.State != TradeState.Posted || bill.Terms.Kind != TradeKind.Bill || variance == 0
                || Math.Abs(fact.Cost) > Math.Abs(variance) || fact.Cost != 0 && Math.Sign(fact.Cost) != Math.Sign(variance))
                throw new LedgerRuleException("The cost adjustment does not match the approved bill.");
            lines.Add(new(setup.VarianceAccountId, -fact.Cost));
        }
        else lines.Add(new(setup.AccrualAccountId, -fact.Cost));
        Guid? journalId = lines.All(x => x.SignedAmount == 0) ? null
            : await posting.PostAsync(scope, book, fact.Id, $"REC-{fact.Id:N}", fact.On, "Purchase stock cost",
                TradePosting.InventoryMaker, TradePosting.InventoryReviewer, lines, ct);
        receipt.Complete(journalId, setup.AccrualAccountId);
    }

    private async Task AccrueStockAdjustmentAsync(ResourceScope scope, AccountingBook book, TradeSetup setup,
        ReceiptAccrual receipt, StockAdjustment stock, CancellationToken ct)
    {
        var fact = receipt.Fact;
        if (stock.Transfer || fact.Cost == 0)
        {
            receipt.Complete(null, setup.InventoryAccountId);
            return;
        }
        var accounts = await ledger.AccountsAsync(scope, [setup.InventoryAccountId, setup.VarianceAccountId], ct);
        if (accounts.Length != 2 || accounts.Any(x => x.IsArchived || x.Purpose == AccountPurpose.Group))
        {
            receipt.WaitFor("Inventory count posting accounts are unavailable.");
            return;
        }
        var journalId = await posting.PostAsync(scope, book, fact.Id, $"CNT-{fact.Id:N}", fact.On, "Stock count variance",
            TradePosting.InventoryMaker, TradePosting.InventoryReviewer,
            [new(setup.InventoryAccountId, fact.Cost), new(setup.VarianceAccountId, -fact.Cost)], ct);
        receipt.Complete(journalId, setup.VarianceAccountId);
    }

    private async Task AccrueSalesAsync(ResourceScope scope, AccountingBook book, Guid inventoryId, ReceiptAccrual receipt, CancellationToken ct)
    {
        var sales = await receivables.SetupAsync(scope, ct);
        if (sales is null) { receipt.WaitFor("Configure receivable posting accounts."); return; }
        var cogsId = sales.Accounts.CostOfGoodsAccountId;
        var accounts = await ledger.AccountsAsync(scope, [inventoryId, cogsId], ct);
        if (accounts.Length != 2 || accounts.Any(x => x.IsArchived || x.Purpose == AccountPurpose.Group))
        { receipt.WaitFor("Sales inventory posting accounts are unavailable."); return; }
        var fact = receipt.Fact;
        if (fact.ReversesId is Guid originalId)
        {
            var original = await store.ReceiptAsync(scope, originalId, ct) ?? throw new ResourceNotFoundException();
            if (!original.IsSales || original.Fact.PermitId != fact.PermitId || original.Fact.Sale != fact.Sale
                || original.Fact.WarehouseId != fact.WarehouseId || original.ItemId != fact.ItemId || original.Fact.On > fact.On)
                throw new LedgerRuleException("The return does not match the original shipment.");
            original.RecordSalesReturn(fact.Quantity, fact.Cost);
        }
        Guid? journalId = fact.Cost == 0 ? null
            : await posting.PostAsync(scope, book, fact.Id, $"SHP-{fact.Id:N}", fact.On,
                fact.ReversesId is null ? "Sales cost of goods" : "Sales stock return",
                TradePosting.InventoryMaker, TradePosting.InventoryReviewer, [new(inventoryId, fact.Cost), new(cogsId, -fact.Cost)], ct);
        receipt.Complete(journalId, cogsId);
    }

    private async Task<ReceiptAccrual> OriginalAsync(ResourceScope scope, ReceiptFact fact, Guid id, CancellationToken ct)
    {
        var original = await store.ReceiptAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
        if (!original.Posted || original.Fact.Quantity <= 0 || original.WarehouseId != fact.WarehouseId
            || original.ItemId != fact.ItemId || original.Fact.PermitId != fact.PermitId)
            throw new LedgerRuleException("The return does not match the original receipt.");
        return original;
    }
}
