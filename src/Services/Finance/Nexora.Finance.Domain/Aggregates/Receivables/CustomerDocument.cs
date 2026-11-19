namespace Nexora.Finance.Domain;

public sealed class CustomerDocument
{
    private CustomerDocument() { }

    public CustomerDocument(AccountingBook book, CustomerTerms terms, JournalActor maker, DateTimeOffset now, bool usesFiscalNumber = false)
    {
        Id = Guid.CreateVersion7();
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        UsesFiscalNumber = usesFiscalNumber;
        Number = usesFiscalNumber ? $"~{Id:N}" : terms.Number;
        Terms = terms with { Number = Number };
        MakerIssuer = maker.Issuer;
        MakerSubject = maker.Subject;
        CreatedAtUtc = now;
        Validate(book, terms);
    }

    private static void Validate(AccountingBook book, CustomerTerms terms)
    {
        if (terms.CustomerId == Guid.Empty || terms.Total <= 0 || terms.Total > 1_000_000_000_000m
            || Math.Round(terms.Total, book.MinorUnits) != terms.Total)
            throw new ArgumentException("Invalid customer, document amount or precision.");
        if (terms.Currency != book.BaseCurrency || terms.On < book.StartsOn || terms.On.Year > 9998
            || terms.DueOn is DateOnly due && (terms.OpeningSource is null && due < terms.On || due.Year > 9998))
            throw new ArgumentException("Invalid currency, document date or due date.");
        book.DemandTaxDateOpen(terms.On);
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public CustomerTerms Terms { get; private set; } = null!;
    public string Number { get; private set; } = "";
    public bool UsesFiscalNumber { get; private set; }
    public int? NumberFiscalYear { get; private set; }
    public long? NumberSequence { get; private set; }
    public string MakerIssuer { get; private set; } = "";
    public string MakerSubject { get; private set; } = "";
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public long Version { get; private set; } = 1;
    public CustomerDocumentState State { get; private set; } = CustomerDocumentState.Submitted;
    public Guid? JournalId { get; private set; }
    public decimal OpenBalance { get; private set; }

    public bool MadeBy(JournalActor actor) => MakerIssuer == actor.Issuer && MakerSubject == actor.Subject;
    public void DemandIndependent(JournalActor actor)
    {
        if (State != CustomerDocumentState.Submitted || MadeBy(actor))
            throw new LedgerRuleException("A different reviewer must approve the submitted version.");
    }

    public void Post(Guid journal, decimal balance)
    {
        if (State != CustomerDocumentState.Submitted || balance < 0 || balance > Terms.Total
            || UsesFiscalNumber && NumberSequence is null)
            throw new LedgerRuleException("The customer document cannot be posted.");
        JournalId = journal;
        OpenBalance = balance;
        State = CustomerDocumentState.Posted;
        Version++;
    }

    public void AssignFiscalNumber(string number, int year, long sequence)
    {
        if (!UsesFiscalNumber || Terms.Kind != CustomerDocumentKind.Invoice || State != CustomerDocumentState.Submitted
            || NumberSequence.HasValue)
            throw new LedgerRuleException("This invoice cannot be assigned a fiscal number.");
        Number = number;
        Terms = Terms with { Number = number };
        NumberFiscalYear = year;
        NumberSequence = sequence;
    }

    public void ReviseInvoice(CustomerTerms replacement, JournalActor actor, AccountingBook book)
    {
        if (State != CustomerDocumentState.Submitted || !MadeBy(actor) || Terms.Kind != CustomerDocumentKind.Invoice
            || replacement.Kind != CustomerDocumentKind.Invoice || replacement.Number != Number)
            throw new LedgerRuleException("Only the maker may revise the submitted invoice.");
        book.DemandTaxDateOpen(Terms.On);
        Validate(book, replacement);
        Terms = replacement;
        Version++;
    }

    public void Cancel(JournalActor actor)
    {
        if (State != CustomerDocumentState.Submitted || !MadeBy(actor))
            throw new LedgerRuleException("Only the maker may cancel a submitted customer document.");
        State = CustomerDocumentState.Cancelled;
        Version++;
    }

    public void Consume(Guid customerId, DateOnly on, decimal amount)
    {
        if (State != CustomerDocumentState.Posted || Terms.CustomerId != customerId || on < Terms.On
            || amount <= 0 || amount > OpenBalance)
            throw new LedgerRuleException("Customer, date or remaining balance does not allow this settlement.");
        OpenBalance -= amount;
        Version++;
    }
}
