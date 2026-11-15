namespace Nexora.Finance.Domain;

public sealed class ReceiptAccrual
{
    private ReceiptAccrual() { }
    public ReceiptAccrual(ReceiptFact fact)
    {
        Id = fact.Id;
        TenantId = fact.TenantId;
        WorkspaceId = fact.WorkspaceId;
        WarehouseId = fact.WarehouseId;
        ItemId = fact.ItemId;
        Sequence = fact.Sequence;
        Fact = fact;
        IsSales = fact.Sale is not null;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid WarehouseId { get; private set; }
    public Guid ItemId { get; private set; }
    public long Sequence { get; private set; }
    public bool IsSales { get; private set; }
    public ReceiptFact Fact { get; private set; } = null!;
    public Guid? JournalId { get; private set; }
    public bool Posted { get; private set; }
    public string? PendingReason { get; private set; }
    public Guid? AccrualAccountId { get; private set; }
    public decimal MatchedQuantity { get; private set; }
    public decimal MatchedCost { get; private set; }
    public decimal ReturnedQuantity { get; private set; }
    public decimal ReturnedCost { get; private set; }
    public decimal CreditedQuantity { get; private set; }
    public decimal InvoiceReserved { get; private set; }
    public decimal InvoiceReservedNet { get; private set; }
    public decimal InvoicePostedNet { get; private set; }
    public decimal AvailableToBill => IsSales || Fact.Stock is not null ? 0 : Fact.Quantity - MatchedQuantity - ReturnedQuantity;
    public decimal AvailableToInvoice => Posted && IsSales && Fact.ReversesId is null
        ? Math.Max(0, -Fact.Quantity - MatchedQuantity - ReturnedQuantity - InvoiceReserved) : 0;
    public decimal AvailableSalesCredit => Posted && IsSales && Fact.ReversesId is null
        ? Math.Max(0, MatchedQuantity + ReturnedQuantity + Fact.Quantity - CreditedQuantity) : 0;

    public void DemandInvoiceQuantity(decimal quantity)
    {
        if (quantity <= 0 || Math.Round(quantity, 6) != quantity || quantity > AvailableToInvoice)
            throw new LedgerRuleException("Invoice quantity exceeds the remaining shipment allowance.");
    }

    public decimal ReserveInvoice(decimal quantity, int minorUnits)
    {
        DemandInvoiceQuantity(quantity);
        var net = Math.Max(0, SalesNet(MatchedQuantity + InvoiceReserved + quantity, minorUnits) - InvoicePostedNet - InvoiceReservedNet);
        InvoiceReserved += quantity;
        InvoiceReservedNet += net;
        return net;
    }

    public void ReleaseInvoice(decimal quantity, decimal net)
    {
        if (quantity <= 0 || quantity > InvoiceReserved || net < 0 || net > InvoiceReservedNet)
            throw new LedgerRuleException("The held invoice quantity or amount changed.");
        InvoiceReserved -= quantity;
        InvoiceReservedNet -= net;
    }

    public void BillShipment(decimal quantity, decimal net, int minorUnits)
    {
        if (quantity > -Fact.Quantity - MatchedQuantity - ReturnedQuantity
            || net > SalesNet(-Fact.Quantity - ReturnedQuantity, minorUnits) - InvoicePostedNet)
            throw new LedgerRuleException("A stock return reduced the shipment allowance. Revise or cancel the invoice.");
        ReleaseInvoice(quantity, net);
        MatchedQuantity += quantity;
        InvoicePostedNet += net;
    }

    private decimal SalesNet(decimal quantity, int minorUnits) =>
        Math.Round(quantity * Fact.Sale!.UnitPrice, minorUnits, MidpointRounding.AwayFromZero);

    public void RecordSalesReturn(decimal quantity, decimal cost)
    {
        if (!Posted || !IsSales || Fact.ReversesId is not null || quantity <= 0
            || quantity > -Fact.Quantity - ReturnedQuantity || cost < 0 || cost > -Fact.Cost - ReturnedCost)
            throw new LedgerRuleException("Return exceeds the recorded shipment cost or quantity.");
        ReturnedQuantity += quantity;
        ReturnedCost += cost;
    }

    public void CreditShipment(decimal quantity)
    {
        if (quantity <= 0 || quantity > AvailableSalesCredit) throw new LedgerRuleException("Credit exceeds billed and returned quantity.");
        CreditedQuantity += quantity;
    }

    public void ConsumeSalesReturn(decimal quantity)
    {
        if (!Posted || !IsSales || Fact.ReversesId is null || quantity <= 0 || quantity > Fact.Quantity - CreditedQuantity)
            throw new LedgerRuleException("Credit exceeds the remaining physical return.");
        CreditedQuantity += quantity;
    }

    public void WaitFor(string reason) => PendingReason = reason;
    public void Complete(Guid? journalId, Guid accrualAccountId)
    {
        JournalId = journalId;
        Posted = true;
        PendingReason = null;
        AccrualAccountId = accrualAccountId;
    }
    public decimal Match(decimal quantity, int minorUnits)
    {
        if (!Posted || Fact.Quantity <= 0 || quantity <= 0 || quantity > AvailableToBill)
            throw new LedgerRuleException("Billed quantity exceeds the unmatched receipt.");
        var cost = CostFor(quantity, minorUnits);
        MatchedQuantity += quantity;
        MatchedCost += cost;
        return cost;
    }
    public decimal ReturnUnbilled(decimal quantity, int minorUnits)
    {
        if (!Posted || quantity <= 0 || quantity > AvailableToBill) throw new LedgerRuleException("Return exceeds unbilled receipt quantity.");
        var cost = CostFor(quantity, minorUnits);
        ReturnedQuantity += quantity;
        ReturnedCost += cost;
        return cost;
    }
    public void CreditBilled(decimal quantity)
    {
        if (!Posted || quantity <= 0 || quantity > MatchedQuantity - CreditedQuantity)
            throw new LedgerRuleException("Return exceeds the billed receipt quantity.");
        CreditedQuantity += quantity;
    }
    private decimal CostFor(decimal quantity, int minorUnits) =>
        Math.Round((MatchedQuantity + ReturnedQuantity + quantity) / Fact.Quantity * Fact.Cost, minorUnits, MidpointRounding.AwayFromZero)
        - MatchedCost - ReturnedCost;
}
