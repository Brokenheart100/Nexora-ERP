namespace Nexora.Finance.Domain;

public static class CashStatements
{
    public static CashStatement Flow(FinanceHistory history, StatementPeriod period)
    {
        var trades = history.Trades.ToDictionary(x => x.Id);
        var byJournal = history.Trades.ToDictionary(x => x.Source.JournalId);
        var customerJournals = history.Customers.Where(x => x.Terms.Kind is CustomerDocumentKind.Receipt or CustomerDocumentKind.Refund)
            .Select(x => x.Source.JournalId).ToHashSet();
        var entries = new List<CashContribution>();
        decimal opening = 0;
        foreach (var journal in history.CashLines.GroupBy(x => x.Source))
        {
            var net = journal.Where(x => x.Cash).Sum(x => x.Signed);
            if (net == 0) continue;
            var source = journal.Key;
            byJournal.TryGetValue(source.JournalId, out var trade);
            if (source.On < period.From || source.Kind == JournalKind.Opening || trade?.Terms.Kind == TradeKind.Opening)
            {
                opening += net;
                continue;
            }
            var kind = trade?.Terms.Kind;
            if (kind == TradeKind.Void && trade!.Terms.SourceId is Guid original && trades.TryGetValue(original, out var reversed))
                kind = reversed.Terms.Kind;
            var contra = journal.Where(x => !x.Cash && x.Signed != 0).Select(x => x.Category).Distinct().ToArray();
            var (key, name, section) = kind switch
            {
                _ when source.CashActivity == CashActivity.Operating => ("manual-operating", "手工经营收付", "operating"),
                _ when source.CashActivity == CashActivity.Investing => ("manual-investing", "投资活动收付", "investing"),
                _ when source.CashActivity == CashActivity.Financing => ("manual-financing", "筹资活动收付", "financing"),
                TradeKind.Payment or TradeKind.SupplierRefund => ("supplier-cash", "供应商收付", "operating"),
                TradeKind.Income or TradeKind.Expense or TradeKind.Donation => ("other-operating", "其他经营收付", "operating"),
                _ when customerJournals.Contains(source.JournalId) => ("customer-cash", "客户收付", "operating"),
                _ when contra.Length == 1 && contra[0] == AccountCategory.Equity => ("capital-cash", "权益资金变动", "financing"),
                _ when contra.Length > 0 && contra.All(AccrualStatement.IsProfitAndLoss) => ("other-operating", "其他经营收付", "operating"),
                _ => ("unclassified-cash", "待分类现金变动", "unclassified")
            };
            entries.Add(new(key, name, section, source, net, Debit: Math.Max(0, net), Credit: Math.Max(0, -net)));
        }
        var rows = Rows(entries);
        decimal Sum(string section) => rows.Where(x => x.Section == section).Sum(x => x.Amount);
        var movement = entries.Sum(x => x.Amount);
        return new(new(rows, [new("cash-opening", opening), new("operating", Sum("operating")),
            new("investing", Sum("investing")), new("financing", Sum("financing")), new("unclassified", Sum("unclassified")),
            new("cash-change", movement), new("cash-closing", opening + movement)]), entries.ToArray());
    }

    public static CashStatement Profit(FinanceHistory history, StatementPeriod period, int minorUnits)
    {
        var result = new List<CashContribution>();
        var docs = history.Customers.ToDictionary(x => x.Id);
        var trades = history.Trades.ToDictionary(x => x.Id);
        var directCash = history.CashLines.GroupBy(x => x.Source)
            .Where(x => x.Key.On >= period.From && x.Key.Kind != JournalKind.Opening
                && x.Where(line => line.Cash).Sum(line => line.Signed) != 0
                && x.Where(line => !line.Cash && line.Signed != 0).All(line => AccrualStatement.IsProfitAndLoss(line.Category)))
            .SelectMany(x => x.Where(line => !line.Cash && AccrualStatement.IsProfitAndLoss(line.Category)));
        foreach (var line in directCash)
        {
            var isIncome = line.Category == AccountCategory.Income;
            result.Add(new(line.AccountId.ToString(), line.Name, isIncome ? "income" : "expense", line.Source,
                isIncome ? -line.Signed : line.Signed, line.AccountId, line.Code, line.Debit, line.Credit));
        }

        var allocations = new Dictionary<Guid, decimal>();
        var refundedCredits = new Dictionary<Guid, decimal>();
        foreach (var customer in history.Customers.OrderBy(x => x.Source.On).ThenBy(x => x.Source.Number))
        {
            var t = customer.Terms;
            if (t.Kind is not (CustomerDocumentKind.Allocation or CustomerDocumentKind.Refund)) continue;
            if (t.FundsId is Guid funds && docs.TryGetValue(funds, out var credit) && credit.Terms.Kind == CustomerDocumentKind.Credit)
            {
                var net = Allocate(refundedCredits, credit.Id, credit.Terms.Total, Net(credit.Terms), t.Total, minorUnits);
                Add("cash-sales", "已收销售净额", "income", customer.Source, -net);
            }
            if (t.Kind == CustomerDocumentKind.Allocation && t.InvoiceId is Guid id && docs.TryGetValue(id, out var invoice))
            {
                var net = Allocate(allocations, invoice.Id, invoice.Terms.Total, Net(invoice.Terms), t.Total, minorUnits);
                Add("cash-sales", "已收销售净额", "income", customer.Source, net);
            }
        }

        var paid = new Dictionary<Guid, decimal>();
        var recovered = new Dictionary<Guid, decimal>();
        foreach (var trade in history.Trades.OrderBy(x => x.Source.On).ThenBy(x => x.Source.Number))
        {
            var payment = trade;
            var sign = 1;
            if (trade.Terms.Kind == TradeKind.Void)
            {
                if (trade.Terms.SourceId is not Guid original || !trades.TryGetValue(original, out payment!)) continue;
                sign = -1;
            }
            if (payment.Terms.SourceId is not Guid id || !trades.TryGetValue(id, out var document)) continue;
            switch (payment.Terms.Kind)
            {
                case TradeKind.Payment when document.Terms.Kind == TradeKind.Bill:
                    var net = document.Terms.BillReceipts?.Sum(x => x.Net) ?? document.Terms.Amount;
                    Add("cash-purchases", "已付采购净额", "expense", trade.Source,
                        Allocate(paid, id, document.Total, net, payment.Total * sign, minorUnits));
                    break;
                case TradeKind.SupplierRefund when document.Terms.Kind == TradeKind.SupplierCredit && document.Total > 0:
                    // A supplier credit settles unpaid payable first. The residual recovery retains the credit's tax ratio.
                    var recoveryNet = Round(document.Recovery * (document.Total - document.TaxCredit) / document.Total, minorUnits);
                    Add("cash-purchases", "已付采购净额", "expense", trade.Source,
                        -Allocate(recovered, id, document.Recovery, recoveryNet, payment.Total * sign, minorUnits));
                    break;
            }
        }

        var rows = Rows(result);
        var income = rows.Where(x => x.Section == "income").Sum(x => x.Amount);
        var expense = rows.Where(x => x.Section == "expense").Sum(x => x.Amount);
        return new(new(rows, [new("income", income), new("expense", expense), new("profit", income - expense)]), result.ToArray());

        void Add(string key, string name, string section, PostedSource source, decimal amount)
        {
            if (source.On >= period.From && amount != 0) result.Add(new(key, name, section, source, amount));
        }
    }

    private static decimal Net(CustomerTerms terms) => terms.Lines?.Sum(x => x.Net) ?? 0;
    private static StatementRow[] Rows(IEnumerable<CashContribution> entries) => entries.GroupBy(x => x.Key)
        .Select(x => new StatementRow(x.Key, x.Last().Code, x.Last().Name, x.Last().Section, x.Sum(row => row.Amount))).ToArray();
    private static decimal Allocate(Dictionary<Guid, decimal> running, Guid id, decimal gross, decimal net, decimal delta, int minorUnits)
    {
        if (gross <= 0) return 0;
        var previous = running.GetValueOrDefault(id);
        var next = previous + delta;
        running[id] = next;
        return Round(net * next / gross, minorUnits) - Round(net * previous / gross, minorUnits);
    }
    private static decimal Round(decimal amount, int minorUnits) => Math.Round(amount, minorUnits, MidpointRounding.AwayFromZero);
}
