namespace Nexora.Finance.Domain;

public static class OpenItems
{
    public static OpenItem[] At(FinanceHistory history, DateOnly through, bool customers)
    {
        var items = customers ? CustomerInvoices(history, through) : SupplierBills(history, through);
        return items.Where(x => x.Outstanding != 0).OrderBy(x => x.DueOn).ThenBy(x => x.Number, StringComparer.Ordinal).ToArray();
    }

    private static IEnumerable<OpenItem> CustomerInvoices(FinanceHistory history, DateOnly through)
    {
        var settlements = history.Customers.Where(x => x.Terms.InvoiceId.HasValue
            && x.Terms.Kind is CustomerDocumentKind.Allocation or CustomerDocumentKind.Credit)
            .ToLookup(x => x.Terms.InvoiceId!.Value);
        foreach (var invoice in history.Customers.Where(x => x.Terms.Kind == CustomerDocumentKind.Invoice))
        {
            var terms = invoice.Terms;
            var balance = terms.Total + settlements[invoice.Id].Sum(x => x.ReceivableDelta);
            var due = terms.DueOn ?? terms.On;
            yield return new(invoice.Id, terms.CustomerId, terms.CustomerName, terms.Number, terms.On, due,
                invoice.Source.JournalId, terms.Total, balance, Bucket(due, through));
        }
    }

    private static IEnumerable<OpenItem> SupplierBills(FinanceHistory history, DateOnly through)
    {
        var documents = history.Trades.ToDictionary(x => x.Id);
        var changes = new Dictionary<Guid, decimal>();
        foreach (var item in history.Trades)
        {
            var terms = item.Terms;
            if (terms.SourceId is not Guid source) continue;
            switch (terms.Kind)
            {
                case TradeKind.Payment:
                    changes[source] = changes.GetValueOrDefault(source) - item.Total;
                    break;
                case TradeKind.SupplierCredit:
                    changes[source] = changes.GetValueOrDefault(source) - (item.Total - item.Recovery);
                    break;
                case TradeKind.Void when documents.TryGetValue(source, out var original)
                    && original.Terms.Kind == TradeKind.Payment && original.Terms.SourceId is Guid bill:
                    changes[bill] = changes.GetValueOrDefault(bill) + original.Total;
                    break;
            }
        }
        foreach (var bill in history.Trades.Where(x => x.Terms.Kind == TradeKind.Bill))
        {
            var terms = bill.Terms;
            var due = terms.DueOn ?? terms.On;
            yield return new(bill.Id, terms.PartnerId, null, terms.Number, terms.On, due, bill.Source.JournalId,
                bill.Total, bill.Total + changes.GetValueOrDefault(bill.Id), Bucket(due, through));
        }
    }

    private static string Bucket(DateOnly due, DateOnly through) => (through.DayNumber - due.DayNumber) switch
    {
        <= 0 => "current",
        <= 30 => "1-30",
        <= 60 => "31-60",
        <= 90 => "61-90",
        _ => "over-90"
    };
}
