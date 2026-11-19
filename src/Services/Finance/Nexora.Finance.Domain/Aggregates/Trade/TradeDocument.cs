namespace Nexora.Finance.Domain;

public sealed class TradeDocument
{
    private BillReceiptMatch[]? _billMatches;
    private TradeDocument() { }
    public TradeDocument(AccountingBook book, TradeTerms terms, JournalActor maker, DateTimeOffset now)
    {
        if (terms.On < book.StartsOn || terms.On.Year > 9998 || terms.Number.Length is < 1 or > 60 || terms.Memo.Length is < 1 or > 300)
            throw new ArgumentException("Invalid trading document date, number or description.");
        book.DemandTaxDateOpen(terms.On);
        if (terms.Kind is not (TradeKind.Void or TradeKind.SupplierCredit) && (terms.Amount <= 0 || terms.Amount > 1_000_000_000_000m || Math.Round(terms.Amount, book.MinorUnits) != terms.Amount))
            throw new ArgumentException("Invalid amount for the book currency.");
        if (terms.Kind == TradeKind.Bill && terms.BillReceipts is null && (terms.Quantity is <= 0 or > 1_000_000m || Math.Round(terms.Quantity, 6) != terms.Quantity))
            throw new ArgumentException("Invalid invoice quantity.");
        if (terms.DueOn is DateOnly due && (terms.Kind != TradeKind.Bill || terms.OpeningSource is null && due < terms.On || due.Year > 9998))
            throw new ArgumentException("The supplier bill due date is invalid.");
        Id = Guid.CreateVersion7();
        TenantId = book.TenantId;
        WorkspaceId = book.WorkspaceId;
        Number = terms.Number;
        Terms = terms;
        MakerIssuer = maker.Issuer;
        MakerSubject = maker.Subject;
        CreatedAtUtc = now;
    }
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public string Number { get; private set; } = "";
    public TradeTerms Terms { get; private set; } = null!;
    public TradeState State { get; private set; } = TradeState.Submitted;
    public string MakerIssuer { get; private set; } = "";
    public string MakerSubject { get; private set; } = "";
    public Guid? JournalId { get; private set; }
    public Guid? ReversedById { get; private set; }
    public decimal Outstanding { get; private set; }
    public decimal Total { get; private set; }
    public decimal PurchaseVariance { get; private set; }
    public decimal CreditedQuantity { get; private set; }
    public decimal CreditedNet { get; private set; }
    public decimal CreditedTax { get; private set; }
    public decimal CreditedPayable { get; private set; }
    public decimal Recoverable { get; private set; }
    public decimal RecoveryTotal { get; private set; }
    public IReadOnlyList<BillReceiptMatch>? BillMatches => _billMatches is null ? null : Array.AsReadOnly(_billMatches);
    public long? PartnerVersion { get; private set; }
    public long Version { get; private set; } = 1;
    public DateTimeOffset CreatedAtUtc { get; private set; }
    public bool MadeBy(JournalActor actor) => actor.Issuer == MakerIssuer && actor.Subject == MakerSubject;

    public void DemandIndependent(JournalActor actor)
    {
        if (State != TradeState.Submitted) throw new LedgerRuleException("The financial document is no longer pending.");
        if (MadeBy(actor)) throw new LedgerRuleException("The maker cannot approve this document.");
    }

    public void BindPartner(long version) => PartnerVersion = version > 0 ? version : throw new ArgumentException("A versioned partner reference is required.");
    public void BindDonationReceipt(DonationReceiptIdentity identity)
    {
        if (State != TradeState.Submitted || Terms.Kind != TradeKind.Donation || PartnerVersion is null
            || string.IsNullOrWhiteSpace(identity.DonorName) || string.IsNullOrWhiteSpace(identity.RecipientName))
            throw new LedgerRuleException("A pending donation with a verified donor and recipient is required.");
        Terms = Terms with { DonationIdentity = identity };
    }

    public void BindBillMatches(BillReceiptMatch[] matches)
    {
        if (State != TradeState.Submitted || Terms.Kind != TradeKind.Bill || matches.Length == 0)
            throw new LedgerRuleException("An unposted bill and receipt matches are required.");
        _billMatches = matches.ToArray();
    }

    public void Approve(JournalActor actor, Guid journalId, decimal total, decimal variance = 0, decimal recovery = 0)
    {
        DemandIndependent(actor);
        JournalId = journalId;
        Total = total;
        PurchaseVariance = variance;
        RecoveryTotal = Recoverable = recovery;
        if (Terms.Kind == TradeKind.Bill) Outstanding = total;
        State = TradeState.Posted;
        Version++;
    }
    public void Cancel(JournalActor actor)
    {
        if (!MadeBy(actor) || State != TradeState.Submitted) throw new LedgerRuleException("Only the maker can cancel a pending document.");
        State = TradeState.Cancelled;
        Version++;
    }
    public void Allocate(decimal amount)
    {
        DemandOpenBill();
        if (amount <= 0 || amount > Outstanding) throw new LedgerRuleException("Payment exceeds the outstanding bill balance.");
        Outstanding -= amount;
        Version++;
    }
    public void Release(decimal amount)
    {
        DemandOpenBill();
        if (amount <= 0 || amount > Total - CreditedPayable - Outstanding) throw new LedgerRuleException("Invalid payment reversal allocation.");
        Outstanding += amount;
        Version++;
    }
    public (decimal Net, decimal Tax, decimal Payable) Credit(Guid receiptId, decimal quantity, int minorUnits)
    {
        DemandOpenBill();
        var match = BillMatches?.SingleOrDefault(x => x.ReceiptId == receiptId);
        if (match is null && (BillMatches is not null || Terms.SourceId != receiptId))
            throw new LedgerRuleException("The bill does not contain the original receipt.");
        var billed = match?.Quantity ?? Terms.Quantity;
        var creditedQuantity = match?.CreditedQuantity ?? CreditedQuantity;
        if (quantity <= 0 || quantity > billed - creditedQuantity)
            throw new LedgerRuleException("Credit quantity exceeds the bill quantity.");
        var fraction = (creditedQuantity + quantity) / billed;
        var net = Math.Round((match?.Net ?? Terms.Amount) * fraction, minorUnits, MidpointRounding.AwayFromZero) - (match?.CreditedNet ?? CreditedNet);
        var tax = Math.Round((match?.Tax ?? Total - Terms.Amount) * fraction, minorUnits, MidpointRounding.AwayFromZero) - (match?.CreditedTax ?? CreditedTax);
        if (net + tax <= 0) throw new LedgerRuleException("The credit amount rounds to zero.");
        var payable = Math.Min(Outstanding, net + tax);
        Outstanding -= payable;
        CreditedQuantity += quantity;
        CreditedNet += net;
        CreditedTax += tax;
        CreditedPayable += payable;
        if (match is not null)
            _billMatches = _billMatches!.Select(x => x.Id != match.Id ? x : x with
            {
                CreditedQuantity = x.CreditedQuantity + quantity, CreditedNet = x.CreditedNet + net, CreditedTax = x.CreditedTax + tax
            }).ToArray();
        Version++;
        return (net, tax, payable);
    }
    public void CollectRecovery(decimal amount)
    {
        if (State != TradeState.Posted || Terms.Kind != TradeKind.SupplierCredit || amount <= 0 || amount > Recoverable)
            throw new LedgerRuleException("Supplier refund exceeds the recoverable credit.");
        Recoverable -= amount;
        Version++;
    }
    public void RestoreRecovery(decimal amount)
    {
        if (State != TradeState.Posted || Terms.Kind != TradeKind.SupplierCredit || amount <= 0 || Recoverable + amount > RecoveryTotal)
            throw new LedgerRuleException("Invalid supplier refund reversal.");
        Recoverable += amount;
        Version++;
    }
    public void MarkReversed(Guid id)
    {
        if (State != TradeState.Posted || ReversedById is not null || Terms.Kind is TradeKind.Bill or TradeKind.Void or TradeKind.Opening or TradeKind.SupplierCredit)
            throw new LedgerRuleException("The selected document cannot be voided.");
        ReversedById = id;
        Version++;
    }
    private void DemandOpenBill()
    {
        if (State != TradeState.Posted || Terms.Kind != TradeKind.Bill || ReversedById is not null)
            throw new LedgerRuleException("A posted supplier bill is required.");
    }
}
