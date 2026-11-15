namespace Nexora.Purchasing.Domain;

public sealed class PurchaseOrder
{
    private readonly List<PurchaseOrderLine> _lines = [];
    private PurchaseOrder() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid? DepartmentId { get; private set; }
    public string Number { get; private set; } = "";
    public string Currency { get; private set; } = "";
    public int MinorUnits { get; private set; }
    public DateOnly On { get; private set; }
    public Guid SupplierId { get; private set; }
    public string SupplierCode { get; private set; } = "";
    public string SupplierName { get; private set; } = "";
    public long SupplierVersion { get; private set; }
    public string Note { get; private set; } = "";
    public string MakerIssuer { get; private set; } = "";
    public string MakerSubject { get; private set; } = "";
    public string? ApproverIssuer { get; private set; }
    public string? ApproverSubject { get; private set; }
    public long? ApprovedVersion { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? ApprovedAtUtc { get; private set; }
    public PurchaseState State { get; private set; } = PurchaseState.Draft;
    public long Version { get; private set; } = 1;
    public IReadOnlyCollection<PurchaseOrderLine> Lines => _lines.AsReadOnly();

    public static PurchaseOrder Start(Guid tenantId, Guid workspaceId, string number, PurchaseTerms terms,
        DateOnly on, SupplierReference supplier, IReadOnlyList<LineTerms> lines, string? note, PurchaseActor maker, DateTimeOffset now,
        Guid? departmentId = null)
    {
        var order = new PurchaseOrder
        {
            Id = Guid.CreateVersion7(), TenantId = tenantId, WorkspaceId = workspaceId, DepartmentId = departmentId,
            Number = NormalizeNumber(number), Currency = terms.Currency, MinorUnits = terms.MinorUnits,
            MakerIssuer = maker.Issuer, MakerSubject = maker.Subject, CreatedAtUtc = now
        };
        order.SetDraft(terms, on, supplier, lines, note);
        return order;
    }

    public static string NormalizeNumber(string value)
    {
        var number = value?.Trim().ToUpperInvariant() ?? "";
        if (number.Length is < 1 or > 60 || number.Any(x => !(char.IsAsciiLetterOrDigit(x) || x is '-' or '_' or '/')))
            throw new ArgumentException("Use a valid purchase order number.");
        return number;
    }

    public void Edit(PurchaseTerms terms, DateOnly on, SupplierReference supplier, IReadOnlyList<LineTerms> lines, string? note, PurchaseActor actor)
    {
        RequireMaker(actor);
        RequireState(PurchaseState.Draft);
        SetDraft(terms, on, supplier, lines, note);
        Version++;
    }

    public bool MadeBy(PurchaseActor actor) => MakerIssuer == actor.Issuer && MakerSubject == actor.Subject;

    public void ReceiptsChanged(bool fullyReceived)
    {
        if (State is not (PurchaseState.Approved or PurchaseState.Receiving or PurchaseState.Received))
            throw new PurchaseRuleException("This order cannot record receipt progress.");
        Move(fullyReceived || State == PurchaseState.Received ? PurchaseState.Received : PurchaseState.Receiving);
    }

    public void CloseReceiving(bool hasPendingPermits)
    {
        if (State is not (PurchaseState.Approved or PurchaseState.Receiving or PurchaseState.Received) || hasPendingPermits)
            throw new PurchaseRuleException("Finish or fence all receipt permits before closing the order.");
        Move(PurchaseState.Closed);
    }

    public void VerifyReferences(SupplierReference supplier, IReadOnlyDictionary<Guid, StockReference> stock)
    {
        if (supplier.Id != SupplierId || supplier.Version != SupplierVersion
            || _lines.Any(line => !stock.TryGetValue(line.ItemId, out var item) || !line.Matches(item)))
            throw new PurchaseRuleException("Supplier or item references changed. Refresh the draft before approval.");
    }

    public void Submit(PurchaseActor actor)
    {
        RequireMaker(actor);
        RequireState(PurchaseState.Draft);
        Move(PurchaseState.Submitted);
    }

    public void Withdraw(PurchaseActor actor)
    {
        RequireMaker(actor);
        RequireState(PurchaseState.Submitted);
        Move(PurchaseState.Draft);
    }

    public void Return(PurchaseActor actor)
    {
        RequireApprover(actor);
        Move(PurchaseState.Draft);
    }

    public void Approve(PurchaseActor actor, DateTimeOffset now)
    {
        RequireApprover(actor);
        ApproverIssuer = actor.Issuer;
        ApproverSubject = actor.Subject;
        ApprovedVersion = Version;
        ApprovedAtUtc = now;
        Move(PurchaseState.Approved);
    }

    public void CancelDraft(PurchaseActor actor)
    {
        RequireMaker(actor);
        RequireState(PurchaseState.Draft);
        Move(PurchaseState.Cancelled);
    }

    private void SetDraft(PurchaseTerms terms, DateOnly on, SupplierReference supplier, IReadOnlyList<LineTerms> lines, string? note)
    {
        if (terms.Currency != Currency || terms.MinorUnits != MinorUnits) throw new PurchaseRuleException("The purchase currency changed.");
        if (on < terms.StartsOn || on.Year > 9998) throw new ArgumentException("The order date is outside the accounting book range.");
        if (supplier.Id == Guid.Empty || supplier.Version < 1) throw new ArgumentException("A valid supplier is required.");
        if (lines.Count is < 1 or > 50 || lines.Select(x => x.Stock.ItemId).Distinct().Count() != lines.Count)
            throw new ArgumentException("Choose one to fifty distinct stock items.");
        note = note?.Trim() ?? "";
        if (note.Length > 300) throw new ArgumentException("Order notes cannot exceed 300 characters.");

        var replacement = lines.Select((line, index) => new PurchaseOrderLine(this, index + 1, line)).ToArray();
        On = on;
        SupplierId = supplier.Id;
        SupplierCode = supplier.Code;
        SupplierName = supplier.Name;
        SupplierVersion = supplier.Version;
        Note = note;
        _lines.Clear();
        _lines.AddRange(replacement);
    }

    private void RequireMaker(PurchaseActor actor)
    {
        if (!MadeBy(actor)) throw new PurchaseRuleException("Only the maker can change this purchase order.");
    }

    private void RequireApprover(PurchaseActor actor)
    {
        RequireState(PurchaseState.Submitted);
        if (MadeBy(actor)) throw new PurchaseRuleException("The maker cannot approve or return this purchase order.");
    }

    private void RequireState(PurchaseState state)
    {
        if (State != state) throw new PurchaseRuleException("The purchase order state does not allow this action.");
    }

    private void Move(PurchaseState state)
    {
        State = state;
        Version++;
    }
}
