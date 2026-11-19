using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class OpeningSubledgers
{
    private async Task PostAsync(ResourceScope scope, AccountingBook book, OpeningSubledgerBatch batch, CancellationToken ct)
    {
        var links = new List<OpeningSubledgerPosting>();
        foreach (var row in batch.Rows)
        {
            var number = "OPEN-" + row.Id.ToString("N");
            var description = $"期初 · {row.Reference}";
            var source = new OpeningSubledgerSource(batch.Id, row.Reference);
            var now = clock.GetUtcNow();
            var delta = row.Kind == OpeningSubledgerKind.Payable ? -row.Amount : row.Amount;
            Guid? journal = row.Amount == 0 ? null : await posting.PostAsync(scope, book, row.Id, number, batch.On, description,
                batch.Maker, batch.Reviewer!, [new(row.AccountId, delta), new(batch.EquityAccountId, -delta)], ct, JournalKind.SubledgerOpening);
            Guid id;
            switch (row.Kind)
            {
                case OpeningSubledgerKind.Stock:
                    var stock = new ReceiptAccrual(new ReceiptFact(row.Id, scope.TenantId, scope.WorkspaceId,
                        row.WarehouseId!.Value, row.ResourceId, Guid.Empty, Guid.Empty, batch.Id, Guid.Empty, 1,
                        batch.On, row.Quantity, row.Amount, batch.Currency, null, Stock: new StockAdjustment(batch.Id, false)));
                    stock.Complete(journal, row.AccountId);
                    trade.Add(stock);
                    id = stock.Id;
                    break;
                case OpeningSubledgerKind.Receivable:
                    var invoice = new CustomerDocument(book, new(CustomerDocumentKind.Invoice, number, batch.On, row.ResourceId, row.Name,
                        batch.Currency, row.Amount, Lines: [], DueOn: row.DueOn, OpeningSource: source), batch.Maker, now);
                    invoice.Post(journal!.Value, row.Amount);
                    receivables.Add(invoice);
                    id = invoice.Id;
                    break;
                case OpeningSubledgerKind.Payable:
                    var bill = new TradeDocument(book, Terms(TradeKind.Bill, number, batch, row, description, source), batch.Maker, now);
                    bill.Approve(batch.Reviewer!, journal!.Value, row.Amount);
                    trade.Add(bill);
                    id = bill.Id;
                    break;
                default:
                    var bank = await trade.BankAsync(scope, row.ResourceId, ct) ?? throw new ResourceNotFoundException();
                    if (bank.Entries != 0) throw new LedgerRuleException("The opening must be the first bank movement.");
                    var bankDocument = new TradeDocument(book, Terms(TradeKind.Opening, number, batch, row, description, source), batch.Maker, now);
                    bankDocument.Approve(batch.Reviewer!, journal!.Value, row.Amount);
                    var movement = new BankMovement(bank, bankDocument, journal.Value, row.Amount);
                    bank.Apply(row.Amount);
                    trade.Add(bankDocument);
                    trade.Add(movement);
                    id = movement.Id;
                    break;
            }
            links.Add(new(row.Id, journal, id));
        }
        batch.Post(links.ToArray());
    }

    private static TradeTerms Terms(TradeKind kind, string number, OpeningSubledgerBatch batch, OpeningSubledgerRow row,
        string description, OpeningSubledgerSource source) =>
        new(kind, batch.On, number, description, row.Amount, kind == TradeKind.Opening ? row.ResourceId : null,
            null, batch.EquityAccountId, null, kind == TradeKind.Bill ? row.ResourceId : null, 1,
            null, null, null, DueOn: row.DueOn, OpeningSource: source);

    private async Task<OpeningSubledgerView> ViewAsync(BookAccess current, OpeningSubledgerBatch batch, CancellationToken ct)
    {
        var checks = new List<OpeningSubledgerCheck>();
        foreach (var (row, link) in batch.Rows.Zip(batch.Postings))
        {
            var (amount, journalId) = await SubledgerAsync(current.Scope, row.Kind, link.SubledgerId, ct);
            var journal = link.JournalId is Guid id ? await ledger.FindAsync(current.Scope, id, false, ct) : null;
            var control = journal?.Lines.Where(x => x.AccountId == row.AccountId).Sum(x => x.Debit - x.Credit) ?? 0;
            var offset = journal?.Lines.Where(x => x.AccountId == batch.EquityAccountId).Sum(x => x.Debit - x.Credit) ?? 0;
            var actual = row.Kind == OpeningSubledgerKind.Payable ? -control : control;
            var journalMatches = link.JournalId is null
                ? row.Kind == OpeningSubledgerKind.Stock && row.Amount == 0
                : journal is { State: JournalState.Posted, Kind: JournalKind.SubledgerOpening } && journal.Lines.Count == 2;
            checks.Add(new(row.Id, row.AccountId, row.Amount, amount ?? 0, actual,
                amount == row.Amount && journalId == link.JournalId && actual == row.Amount && control + offset == 0 && journalMatches));
        }
        return View(batch, current) with { Checks = checks.ToArray() };
    }

    private async Task<(decimal?, Guid?)> SubledgerAsync(ResourceScope scope, OpeningSubledgerKind kind, Guid id, CancellationToken ct)
    {
        switch (kind)
        {
            case OpeningSubledgerKind.Stock:
                var stock = await trade.ReceiptAsync(scope, id, ct);
                return (stock?.Fact.Cost, stock?.JournalId);
            case OpeningSubledgerKind.Receivable:
                var invoice = await receivables.FindAsync(scope, id, ct);
                return (invoice?.Terms.Total, invoice?.JournalId);
            case OpeningSubledgerKind.Payable:
                var bill = await trade.DocumentAsync(scope, id, ct);
                return (bill?.Total, bill?.JournalId);
            default:
                var movement = await trade.MovementAsync(scope, id, ct);
                return (movement?.Amount, movement?.JournalId);
        }
    }

    private static OpeningSubledgerView View(OpeningSubledgerBatch x, BookAccess current) =>
        new(x.Id, x.State.ToString().ToLowerInvariant(), x.Version, x.On, x.Currency, x.FileHash, x.EquityAccountId,
            x.Rows, x.Postings, x.Rejection, x.Maker == Actor(current), []);
}
