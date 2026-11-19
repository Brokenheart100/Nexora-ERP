using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

internal static class CashTaxPostings
{
    public static TaxPosting[] Calculate(FinanceHistory history, TaxPosting[] accrual, TaxPeriod period, int minorUnits)
    {
        var taxes = accrual.ToLookup(x => x.DocumentId);
        var customers = history.Customers.ToDictionary(x => x.Id);
        var suppliers = history.Trades.ToDictionary(x => x.Id);
        var balances = new Dictionary<Guid, CashTaxBalance>();
        var result = new List<TaxPosting>();

        (string Code, decimal Amount)[] Amounts(Guid id, int sign) =>
            taxes[id].Select(x => (x.Code, x.Amount * sign)).ToArray();

        CashTaxBalance Balance(Guid id, decimal gross, IReadOnlyList<(string Code, decimal Amount)> amounts)
        {
            if (!balances.TryGetValue(id, out var balance))
                balances.Add(id, balance = new(gross, amounts, minorUnits));
            return balance;
        }

        (string Code, decimal Amount)[] Split(Guid id, decimal gross, decimal unpaid, bool recovery) =>
            Amounts(id, -1).Select(x =>
            {
                var applied = CashTaxBalance.Prorate(x.Amount, gross, unpaid, minorUnits);
                return (x.Code, recovery ? x.Amount - applied : applied);
            }).ToArray();

        void Emit(PostedSource source, Guid documentId, Guid taxId, string taxNumber,
            string kind, string direction, (string Code, decimal Amount)[] amounts, int sign = 1)
        {
            if (source.On < period.From) return;
            foreach (var (code, amount) in amounts)
                result.Add(new(source.On, source.Number, source.JournalId, documentId,
                    source.SourceNumber, kind, direction, code, amount * sign, taxId, taxNumber));
        }

        foreach (var doc in history.Customers.OrderBy(x => x.Source.On).ThenBy(x => x.Source.Number))
        {
            var terms = doc.Terms;
            if (terms.InvoiceId is Guid invoiceId && customers.TryGetValue(invoiceId, out var invoice))
            {
                if (terms.Kind == CustomerDocumentKind.Allocation)
                    Emit(doc.Source, doc.Id, invoiceId, invoice.Terms.Number, "customer-allocation", "output",
                        Balance(invoiceId, invoice.Terms.Total, Amounts(invoiceId, 1)).Settle(terms.Total));
                else if (terms.Kind == CustomerDocumentKind.Credit && doc.ReceivableDelta < 0)
                {
                    var unpaid = -doc.ReceivableDelta;
                    Emit(doc.Source, doc.Id, invoiceId, invoice.Terms.Number, "customer-credit-adjustment", "output",
                        Balance(invoiceId, invoice.Terms.Total, Amounts(invoiceId, 1))
                            .ApplyUnpaidCredit(unpaid, Split(doc.Id, terms.Total, unpaid, false)));
                }
            }
            if (terms.Kind is (CustomerDocumentKind.Allocation or CustomerDocumentKind.Refund)
                && terms.FundsId is Guid fundsId && customers.TryGetValue(fundsId, out var credit)
                && credit.Terms.Kind == CustomerDocumentKind.Credit)
            {
                var unpaid = -credit.ReceivableDelta;
                Emit(doc.Source, doc.Id, fundsId, credit.Terms.Number,
                    terms.Kind == CustomerDocumentKind.Refund ? "customer-refund" : "customer-credit-applied", "output",
                    Balance(fundsId, credit.Terms.Total - unpaid, Split(fundsId, credit.Terms.Total, unpaid, true))
                        .Settle(terms.Total), -1);
            }
        }

        foreach (var doc in history.Trades.OrderBy(x => x.Source.On).ThenBy(x => x.Source.Number))
        {
            var settlement = doc;
            var sign = 1;
            if (doc.Terms.Kind == TradeKind.Void)
            {
                if (doc.Terms.SourceId is not Guid reversed || !suppliers.TryGetValue(reversed, out settlement!)) continue;
                sign = -1;
            }
            if (settlement.Terms.SourceId is not Guid sourceId || !suppliers.TryGetValue(sourceId, out var source)) continue;
            switch (settlement.Terms.Kind)
            {
                case TradeKind.Payment when source.Terms.Kind == TradeKind.Bill:
                    Emit(doc.Source, doc.Id, sourceId, source.Terms.Number, sign > 0 ? "supplier-payment" : "supplier-payment-void", "input",
                        Balance(sourceId, source.Total, Amounts(sourceId, 1)).Settle(settlement.Total * sign));
                    break;
                case TradeKind.SupplierCredit when source.Terms.Kind == TradeKind.Bill:
                    var unpaid = settlement.Total - settlement.Recovery;
                    if (unpaid > 0)
                        Emit(doc.Source, doc.Id, sourceId, source.Terms.Number, "supplier-credit-adjustment", "input",
                            Balance(sourceId, source.Total, Amounts(sourceId, 1))
                                .ApplyUnpaidCredit(unpaid, Split(settlement.Id, settlement.Total, unpaid, false)));
                    break;
                case TradeKind.SupplierRefund when source.Terms.Kind == TradeKind.SupplierCredit:
                    Emit(doc.Source, doc.Id, sourceId, source.Terms.Number, sign > 0 ? "supplier-refund" : "supplier-refund-void", "input",
                        Balance(sourceId, source.Recovery, Split(sourceId, source.Total, source.Total - source.Recovery, true))
                            .Settle(settlement.Total * sign), -1);
                    break;
            }
        }

        return result.OrderBy(x => x.On).ThenBy(x => x.PostingNumber).ThenBy(x => x.Code, StringComparer.Ordinal)
            .ThenBy(x => x.Kind, StringComparer.Ordinal).ToArray();
    }
}
