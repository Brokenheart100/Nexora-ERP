using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class TradeUseCases
{
    private async Task<(decimal Total, IReadOnlyList<VariancePlan> Variances)> BillAsync(ResourceScope scope, AccountingBook book,
        TradeDocument document, List<PostLine> lines, CancellationToken ct)
    {
        var setup = await SetupAsync(scope, ct);
        var terms = document.Terms;
        var inputs = terms.BillReceipts ?? [new(Required(terms.SourceId), terms.Quantity, terms.Amount, terms.TaxAssessmentId)];
        if (inputs.Length is < 1 or > 50 || inputs.Any(x => x is null || x.Net <= 0 || Math.Round(x.Net, book.MinorUnits) != x.Net)
            || inputs.Select(x => x.ReceiptId).Distinct().Count() != inputs.Length || inputs.Sum(x => x.Net) != terms.Amount)
            throw new ArgumentException("Use distinct receipt lines and ensure their net amounts add to the bill net.");
        var matches = new List<BillReceiptMatch>();
        var variances = new List<VariancePlan>();
        foreach (var input in inputs)
        {
            var receipt = await store.ReceiptAsync(scope, input.ReceiptId, ct) ?? throw new ResourceNotFoundException();
            if (terms.On < receipt.Fact.On || terms.PartnerId != receipt.Fact.SupplierId)
                throw new LedgerRuleException("Bill date or supplier does not match the receipt.");
            if (await store.HasPendingReturnAsync(scope, receipt.Id, ct))
                throw new LedgerRuleException("Resolve pending returns for this receipt before matching the bill.");
            if (Math.Round(input.Quantity, 6) != input.Quantity) throw new ArgumentException("Invalid invoice quantity precision.");
            var receiptCost = receipt.Match(input.Quantity, book.MinorUnits);
            var tax = await BillTaxAsync(scope, book, terms, receipt, input, ct);
            var variance = input.Net - receiptCost;
            if (variance != 0 && terms.Method != "approve-cost-variance")
                throw new LedgerRuleException("Invoice price differs from receipt cost. Use the explicit variance approval route.");
            var match = new BillReceiptMatch(Guid.CreateVersion7(), receipt.Id, input.Quantity, input.Net, tax, variance);
            matches.Add(match);
            if (variance != 0)
                variances.Add(new(scope, document.Id, receipt.Id, terms.On, input.Quantity, variance, book.BaseCurrency, clock.GetUtcNow(),
                    receipt.Fact.Quantity - receipt.ReturnedQuantity - receipt.CreditedQuantity, match.Id));
            lines.Add(new(receipt.AccrualAccountId!.Value, receiptCost));
            lines.Add(new(setup.InputTaxAccountId, tax));
            lines.Add(new(setup.VarianceAccountId, variance));
        }
        var total = terms.Amount + matches.Sum(x => x.Tax);
        document.BindBillMatches(matches.ToArray());
        lines.Add(new(setup.PayableAccountId, -total));
        return (total, variances);
    }

    private async Task<decimal> BillTaxAsync(ResourceScope scope, AccountingBook book, TradeTerms terms,
        ReceiptAccrual receipt, BillReceiptInput line, CancellationToken ct)
    {
        if (line.TaxAssessmentId is not Guid assessmentId) return 0;
        var saved = await taxes.FindAsync(scope, assessmentId, ct) ?? throw new ResourceNotFoundException();
        var snapshot = JsonSerializer.Deserialize<TaxSnapshot>(saved.SnapshotJson)!;
        if (snapshot.Currency != book.BaseCurrency || snapshot.On != terms.On || snapshot.Amounts.Net != line.Net
            || !snapshot.References.Any(x => x.Kind == "partner" && x.ResourceId == receipt.Fact.SupplierId))
            throw new LedgerRuleException("The tax assessment differs from this bill.");
        return snapshot.Amounts.Tax;
    }

    private async Task<(decimal Total, decimal Recovery, ReceiptAccrual Return)> CreditAsync(ResourceScope scope, AccountingBook book,
        TradeTerms terms, List<PostLine> lines, CancellationToken ct)
    {
        var setup = await SetupAsync(scope, ct);
        var bill = await DocumentAsync(scope, Required(terms.SourceId), ct);
        var returned = await store.ReceiptAsync(scope, Required(terms.ReturnReceiptId), ct) ?? throw new ResourceNotFoundException();
        var fact = returned.Fact;
        if (returned.Posted || fact.ReversesId is not Guid originalId
            || terms.On < fact.On || terms.On < bill.Terms.On || !await store.PredecessorPostedAsync(fact, ct))
            throw new LedgerRuleException("The return and bill do not share an eligible receipt.");
        var original = await OriginalAsync(scope, fact, originalId, ct);
        if (-fact.Quantity <= original.AvailableToBill)
            throw new LedgerRuleException("Process this unbilled return as a receipt accrual reversal.");
        var unbilled = Math.Max(0, original.AvailableToBill);
        var accrual = unbilled == 0 ? 0 : original.ReturnUnbilled(unbilled, book.MinorUnits);
        var billed = -fact.Quantity - unbilled;
        original.CreditBilled(billed);
        var (net, tax, payable) = bill.Credit(originalId, billed, book.MinorUnits);
        var recovery = net + tax - payable;
        lines.Add(new(setup.PayableAccountId, payable));
        if (recovery > 0) lines.Add(new(setup.SupplierRecoveryAccountId
            ?? throw new LedgerRuleException("Configure the supplier recovery control account for paid returns."), recovery));
        lines.Add(new(setup.InventoryAccountId, fact.Cost));
        lines.Add(new(original.AccrualAccountId!.Value, accrual));
        lines.Add(new(setup.InputTaxAccountId, -tax));
        lines.Add(new(setup.VarianceAccountId, -net - accrual - fact.Cost));
        return (net + tax, recovery, returned);
    }
}
