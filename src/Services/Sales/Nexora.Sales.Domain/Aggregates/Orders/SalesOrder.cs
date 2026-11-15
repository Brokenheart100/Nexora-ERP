namespace Nexora.Sales.Domain;

public sealed class SalesOrder
{
    private readonly List<SalesOrderLine> _lines = [];
    private SalesOrder() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public Guid? DepartmentId { get; private set; }
    public bool IsQuote { get; private set; }
    public Guid? QuoteId { get; private set; }
    public string Number { get; private set; } = "";
    public string Currency { get; private set; } = "";
    public int MinorUnits { get; private set; }
    public DateOnly On { get; private set; }
    public Guid CustomerId { get; private set; }
    public string CustomerCode { get; private set; } = "";
    public string CustomerName { get; private set; } = "";
    public long CustomerVersion { get; private set; }
    public string Note { get; private set; } = "";
    public string MakerIssuer { get; private set; } = "";
    public string MakerSubject { get; private set; } = "";
    public string? ApproverIssuer { get; private set; }
    public string? ApproverSubject { get; private set; }
    public long? ApprovedVersion { get; private set; }
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public DateTimeOffset? ApprovedAtUtc { get; private set; }
    public SalesState State { get; private set; } = SalesState.Draft;
    public long Version { get; private set; } = 1;
    public IReadOnlyCollection<SalesOrderLine> Lines => _lines.AsReadOnly();

    public static SalesOrder Start(Guid tenantId, Guid workspaceId, string number, SalesTerms terms,
        DateOnly on, CustomerReference customer, IReadOnlyList<LineTerms> lines, string? note, SalesActor maker, DateTimeOffset now, bool isQuote = false,
        Guid? departmentId = null)
    {
        var order = new SalesOrder
        {
            Id = Guid.CreateVersion7(), TenantId = tenantId, WorkspaceId = workspaceId, DepartmentId = departmentId,
            Number = NormalizeNumber(number), IsQuote = isQuote, Currency = terms.Currency, MinorUnits = terms.MinorUnits,
            MakerIssuer = maker.Issuer, MakerSubject = maker.Subject, CreatedAtUtc = now
        };
        order.SetDraft(terms, on, customer, lines, note);
        return order;
    }

    public static string NormalizeNumber(string value)
    {
        var number = value?.Trim().ToUpperInvariant() ?? "";
        if (number.Length is < 1 or > 60 || number.Any(x => !(char.IsAsciiLetterOrDigit(x) || x is '-' or '_' or '/')))
            throw new ArgumentException("Use a valid sales order number.");
        return number;
    }

    public void Edit(SalesTerms terms, DateOnly on, CustomerReference customer, IReadOnlyList<LineTerms> lines, string? note, SalesActor actor)
    {
        RequireMaker(actor);
        RequireState(SalesState.Draft);
        SetDraft(terms, on, customer, lines, note);
        Version++;
    }

    public bool MadeBy(SalesActor actor) => MakerIssuer == actor.Issuer && MakerSubject == actor.Subject;

    public void FulfillmentsChanged(bool fullyFulfilled)
    {
        if (State is not (SalesState.Approved or SalesState.Fulfilling or SalesState.Fulfilled))
            throw new SalesRuleException("This order cannot record fulfillment progress.");
        Move(fullyFulfilled || State == SalesState.Fulfilled ? SalesState.Fulfilled : SalesState.Fulfilling);
    }

    public void CloseFulfilling(bool hasPendingPermits)
    {
        if (State is not (SalesState.Approved or SalesState.Fulfilling or SalesState.Fulfilled) || hasPendingPermits)
            throw new SalesRuleException("Finish or fence all fulfillment permits before closing the order.");
        Move(SalesState.Closed);
    }

    public void VerifyReferences(CustomerReference customer, IReadOnlyDictionary<Guid, StockReference> stock)
    {
        if (customer.Id != CustomerId || customer.Version != CustomerVersion
            || _lines.Any(line => !stock.TryGetValue(line.ItemId, out var item) || !line.Matches(item)))
            throw new SalesRuleException("Customer or item references changed. Refresh the draft before approval.");
    }

    public void IssueQuote(SalesActor actor)
    {
        RequireMaker(actor);
        RequireState(SalesState.Draft);
        if (!IsQuote) throw new SalesRuleException("Only a quote can be issued.");
        Move(SalesState.Quoted);
    }

    public SalesOrder ConvertToOrder(string number, SalesActor actor, DateTimeOffset now)
    {
        RequireMaker(actor);
        RequireState(SalesState.Quoted);
        var lines = _lines.OrderBy(x => x.Ordinal).Select(x => x.Snapshot()).ToArray();
        var order = Start(TenantId, WorkspaceId, number, new(Currency, MinorUnits, On), On,
            new(CustomerId, CustomerCode, CustomerName, CustomerVersion), lines, Note, actor, now, departmentId: DepartmentId);
        order.QuoteId = Id;
        Move(SalesState.Converted);
        return order;
    }

    public void Submit(SalesActor actor)
    {
        RequireMaker(actor);
        RequireState(SalesState.Draft);
        if (IsQuote) throw new SalesRuleException("Convert the quote before submitting an order.");
        Move(SalesState.Submitted);
    }

    public void Withdraw(SalesActor actor)
    {
        RequireMaker(actor);
        RequireState(SalesState.Submitted);
        Move(SalesState.Draft);
    }

    public void Return(SalesActor actor)
    {
        RequireApprover(actor);
        Move(SalesState.Draft);
    }

    public void Approve(SalesActor actor, DateTimeOffset now)
    {
        RequireApprover(actor);
        ApproverIssuer = actor.Issuer;
        ApproverSubject = actor.Subject;
        ApprovedVersion = Version;
        ApprovedAtUtc = now;
        Move(SalesState.Approved);
    }

    public void CancelDraft(SalesActor actor)
    {
        RequireMaker(actor);
        RequireState(SalesState.Draft);
        Move(SalesState.Cancelled);
    }

    private void SetDraft(SalesTerms terms, DateOnly on, CustomerReference customer, IReadOnlyList<LineTerms> lines, string? note)
    {
        if (terms.Currency != Currency || terms.MinorUnits != MinorUnits) throw new SalesRuleException("The sales currency changed.");
        if (on < terms.StartsOn || on.Year > 9998) throw new ArgumentException("The order date is outside the accounting book range.");
        if (customer.Id == Guid.Empty || customer.Version < 1) throw new ArgumentException("A valid customer is required.");
        if (lines.Count is < 1 or > 50 || lines.Select(x => x.Stock.ItemId).Distinct().Count() != lines.Count)
            throw new ArgumentException("Choose one to fifty distinct stock items.");
        note = note?.Trim() ?? "";
        if (note.Length > 300) throw new ArgumentException("Order notes cannot exceed 300 characters.");

        var replacement = lines.Select((line, index) => new SalesOrderLine(this, index + 1, line)).ToArray();
        On = on;
        CustomerId = customer.Id;
        CustomerCode = customer.Code;
        CustomerName = customer.Name;
        CustomerVersion = customer.Version;
        Note = note;
        _lines.Clear();
        _lines.AddRange(replacement);
    }

    private void RequireMaker(SalesActor actor)
    {
        if (!MadeBy(actor)) throw new SalesRuleException("Only the maker can change this sales order.");
    }

    private void RequireApprover(SalesActor actor)
    {
        RequireState(SalesState.Submitted);
        if (MadeBy(actor)) throw new SalesRuleException("The maker cannot approve or return this sales order.");
    }

    private void RequireState(SalesState state)
    {
        if (State != state) throw new SalesRuleException("The sales order state does not allow this action.");
    }

    private void Move(SalesState state)
    {
        State = state;
        Version++;
    }
}
