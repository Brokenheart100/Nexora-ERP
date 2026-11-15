namespace Nexora.Inventory.Domain;

public sealed class ReceiptExecution
{
    private ReceiptExecution() { }
    public ReceiptExecution(ReceiptTerms terms)
    {
        Id = terms.PermitId;
        TenantId = terms.TenantId;
        WorkspaceId = terms.WorkspaceId;
        Terms = terms;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public ReceiptTerms Terms { get; private set; } = null!;
    public long Revision { get; private set; } = 1;
    public decimal Executed { get; private set; }
    public decimal Cost { get; private set; }
    public bool Fenced { get; private set; }

    public bool Fence()
    {
        if (Fenced) return false;
        Fenced = true;
        Revision++;
        return true;
    }

    public decimal Receive(decimal quantity, DateOnly on)
    {
        if (Fenced) throw new StockRuleException("The receipt permit is fenced.");
        if (on < Terms.OrderDate || on.Year > 9998 || quantity <= 0 || Math.Round(quantity, 6) != quantity)
            throw new ArgumentException("Invalid receipt date or quantity.");
        if (quantity > Terms.Quantity - Executed) throw new StockRuleException("Quantity exceeds the remaining receipt allowance.");
        var next = Math.Round((Executed + quantity) * Terms.UnitPrice, Terms.MinorUnits, MidpointRounding.AwayFromZero);
        var cost = next - Cost;
        Executed += quantity;
        Cost = next;
        Revision++;
        return cost;
    }
}
