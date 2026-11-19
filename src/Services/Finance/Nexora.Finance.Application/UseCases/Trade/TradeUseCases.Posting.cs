using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class TradeUseCases
{
    public async Task<TradeDecision> DecideAsync(DecideTrade command, StatementAllocation statements, CancellationToken ct)
    {
        var permission = command.Decision switch
        {
            "approve" => LedgerPermissions.Post,
            "cancel" => LedgerPermissions.Draft,
            _ => throw new ArgumentException("Unknown financial decision.")
        };
        var action = $"trade.{command.Decision}";
        var (current, book) = await access.LockAsync(command.WorkspaceId, permission, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return new(Replay(replay), []);
        var doc = await DocumentAsync(current.Scope, command.DocumentId, ct);
        if (doc.Version != command.ExpectedVersion) throw new RevisionConflictException("The financial document version changed.");
        IReadOnlyList<VariancePlan> variances = [];
        if (command.Decision == "cancel") doc.Cancel(Actor(current));
        else variances = await ApproveAsync(current, book, doc, statements, ct);
        return new(Record(current, command.OperationId, action, command, doc.Id, doc.Version), variances);
    }

    private async Task<IReadOnlyList<VariancePlan>> ApproveAsync(BookAccess current, AccountingBook book, TradeDocument doc, StatementAllocation statements, CancellationToken ct)
    {
        var reviewer = Actor(current);
        doc.DemandIndependent(reviewer);
        var terms = doc.Terms;
        book.DemandTaxDateOpen(terms.On);
        var gate = await posting.GateAsync(current.Scope, book, terms.On, ct);
        if (gate is not null) throw new LedgerRuleException(gate);
        if (terms.Kind == TradeKind.Void)
        {
            await VoidAsync(current, book, doc, statements, ct);
            return [];
        }

        var lines = new List<PostLine>();
        var bankChanges = new List<(BankAccount Bank, decimal Amount)>();
        var total = terms.Amount;
        IReadOnlyList<VariancePlan> variances = [];
        var recovery = 0m;
        ReceiptAccrual? creditedReturn = null;
        if (terms.Kind == TradeKind.Bill)
        {
            (total, variances) = await BillAsync(current.Scope, book, doc, lines, ct);
        }
        else if (terms.Kind == TradeKind.SupplierCredit)
            (total, recovery, creditedReturn) = await CreditAsync(current.Scope, book, terms, lines, ct);
        else
        {
            var bank = await BankAsync(current.Scope, Required(terms.BankId), ct);
            var outgoing = terms.Kind is TradeKind.Payment or TradeKind.Expense or TradeKind.Transfer or TradeKind.OwnerDrawing;
            var bankAmount = outgoing ? -terms.Amount : terms.Amount;
            bankChanges.Add((bank, bankAmount));
            lines.Add(new(bank.AccountId, bankAmount));
            switch (terms.Kind)
            {
                case TradeKind.Opening:
                    if (terms.On != book.StartsOn || bank.Entries != 0) throw new LedgerRuleException("Bank opening must be the first movement on the book start date.");
                    lines.Add(new((await DemandAccount(current.Scope, Required(terms.CounterAccountId), AccountCategory.Equity, AccountPurpose.Posting, ct)).Id, -terms.Amount));
                    break;
                case TradeKind.Expense:
                case TradeKind.Income:
                    var category = terms.Kind == TradeKind.Expense ? AccountCategory.Expense : AccountCategory.Income;
                    lines.Add(new((await DemandAccount(current.Scope, Required(terms.CounterAccountId), category, AccountPurpose.Posting, ct)).Id, -bankAmount));
                    break;
                case TradeKind.OwnerContribution:
                case TradeKind.OwnerDrawing:
                    var counter = Required(terms.CounterAccountId);
                    var fiscalYear = FiscalInvoiceNumber.Year(terms.On, book.FiscalYearStartMonth);
                    var partnership = await partnerships.FindAsync(current.Scope, fiscalYear, ct);
                    if (partnership is not null && !partnership.Partners.Any(x =>
                        (outgoing ? x.DrawingsAccountId : x.CapitalAccountId) == counter))
                        throw new LedgerRuleException("Choose a configured partner drawings or capital account for this fiscal year.");
                    lines.Add(new((await DemandAccount(current.Scope, counter,
                        AccountCategory.Equity, AccountPurpose.Posting, ct)).Id, -bankAmount));
                    break;
                case TradeKind.Transfer:
                    var target = await BankAsync(current.Scope, Required(terms.OtherBankId), ct);
                    if (target.Id == bank.Id) throw new ArgumentException("A transfer needs two different bank accounts.");
                    bankChanges.Add((target, terms.Amount));
                    lines.Add(new(target.AccountId, terms.Amount));
                    break;
                case TradeKind.Donation:
                    var donor = await partners.DemandDonorAsync(current.Scope.WorkspaceId, Required(terms.PartnerId), ct);
                    if (doc.PartnerVersion != donor.Version)
                        throw new LedgerRuleException("Donor reference changed. Submit a new document.");
                    if ((terms.Method == "cash") != (bank.Kind == "cash")) throw new LedgerRuleException("Donation method and cash/bank account differ.");
                    var recipient = await presentation.BrandAsync(current.Scope.WorkspaceId, ct);
                    doc.BindDonationReceipt(new(donor.Name, recipient.LegalName));
                    lines.Add(new((await SetupAsync(current.Scope, ct)).DonationIncomeAccountId, -terms.Amount));
                    break;
                case TradeKind.Payment:
                    var bill = await DocumentAsync(current.Scope, Required(terms.SourceId), ct);
                    if (terms.On < bill.Terms.On) throw new LedgerRuleException("Payment predates the bill.");
                    bill.Allocate(terms.Amount);
                    lines.Add(new((await SetupAsync(current.Scope, ct)).PayableAccountId, terms.Amount));
                    break;
                case TradeKind.SupplierRefund:
                    var credit = await DocumentAsync(current.Scope, Required(terms.SourceId), ct);
                    if (terms.On < credit.Terms.On) throw new LedgerRuleException("Supplier refund predates the credit.");
                    credit.CollectRecovery(terms.Amount);
                    var recoverySetup = await SetupAsync(current.Scope, ct);
                    lines.Add(new(recoverySetup.SupplierRecoveryAccountId
                        ?? throw new LedgerRuleException("Configure the supplier recovery control account."), -terms.Amount));
                    break;
            }
        }

        var journal = await posting.PostAsync(current.Scope, book, doc.Id, terms.Number, terms.On, terms.Memo,
            new(doc.MakerIssuer, doc.MakerSubject), reviewer, lines, ct);
        doc.Approve(reviewer, journal, total, variances.Sum(x => x.Amount), recovery);
        if (creditedReturn is not null) creditedReturn.Complete(journal, (await SetupAsync(current.Scope, ct)).AccrualAccountId);
        foreach (var entry in bankChanges)
        {
            var movement = new BankMovement(entry.Bank, doc, journal, entry.Amount);
            if (terms.StatementLineId is Guid lineId)
                await statements.AttachAsync(current.Scope, book, doc.Id, lineId, movement, Math.Abs(entry.Amount), ct, requireSameDate: true);
            entry.Bank.Apply(entry.Amount);
            store.Add(movement);
        }
        return variances;
    }

    private async Task VoidAsync(BookAccess access, AccountingBook book, TradeDocument reversal, StatementAllocation statements, CancellationToken ct)
    {
        var original = await DocumentAsync(access.Scope, Required(reversal.Terms.SourceId), ct);
        var journalId = original.JournalId ?? throw new LedgerRuleException("A posted original document is required.");
        if (reversal.Terms.On < original.Terms.On) throw new LedgerRuleException("The reversal predates the original document.");
        if (original.Terms.Kind is (TradeKind.OwnerContribution or TradeKind.OwnerDrawing) && original.Terms.StatementLineId is Guid statementLine)
            await statements.ReleaseDocumentMatchAsync(access.Scope, book, statementLine, original.Id, ct);
        original.MarkReversed(reversal.Id);
        var journal = await posting.ReverseAsync(access.Scope, book, journalId, reversal, Actor(access), ct);
        if (original.Terms.Kind == TradeKind.Payment)
        {
            var bill = await DocumentAsync(access.Scope, Required(original.Terms.SourceId), ct);
            bill.Release(original.Total);
        }
        else if (original.Terms.Kind == TradeKind.SupplierRefund)
        {
            var credit = await DocumentAsync(access.Scope, Required(original.Terms.SourceId), ct);
            credit.RestoreRecovery(original.Total);
        }
        reversal.Approve(Actor(access), journal, original.Total);
        foreach (var old in await store.DocumentMovementsAsync(access.Scope, original.Id, ct))
        {
            old.Void();
            var bank = await BankAsync(access.Scope, old.BankId, ct);
            bank.Apply(-old.Amount);
            store.Add(new BankMovement(bank, reversal, journal, -old.Amount, old.Id));
        }
    }
}
