using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class ReceivableUseCases
{
    private async Task ReleaseInvoiceAsync(ResourceScope scope, CustomerDocument doc, CancellationToken ct)
    {
        foreach (var row in doc.Terms.Lines!.Where(x => x.ShipmentId.HasValue))
            (await ShipmentAsync(scope, row.ShipmentId!.Value, ct)).ReleaseInvoice(row.Quantity, row.Net);
    }

    private async Task<CustomerTerms> InvoiceAsync(ResourceScope scope, AccountingBook book, CustomerDraft draft, string number, CancellationToken ct)
    {
        if (draft.Lines is not { Length: >= 1 and <= 50 } inputs || inputs.Any(x => x is null)
            || inputs.Select(x => x.ShipmentId).Distinct().Count() != inputs.Length)
            throw new ArgumentException("Choose one to fifty distinct shipments.");
        var rows = new List<InvoiceLine>();
        SaleSnapshot? customer = null;
        foreach (var input in inputs)
        {
            var shipment = await ShipmentAsync(scope, input.ShipmentId, ct);
            var sale = shipment.Fact.Sale!;
            customer ??= sale;
            if (sale.CustomerId != customer.CustomerId || draft.On < shipment.Fact.On)
                throw new LedgerRuleException("Invoice lines must share the customer and follow their shipment dates.");
            if (await trade.HasPendingReturnAsync(scope, shipment.Id, ct))
                throw new LedgerRuleException("Post the pending stock return before invoicing this shipment.");
            var net = shipment.ReserveInvoice(input.Quantity, book.MinorUnits);
            var amounts = await TaxAsync(scope, book, draft.On, shipment.ItemId, sale.CustomerId, sale.UnitPrice, input.Quantity, ct, net);
            rows.Add(new(shipment.Id, shipment.ItemId, sale.ItemName, input.Quantity, sale.UnitPrice,
                amounts.Net, amounts.Tax, amounts.Components.ToArray()));
        }
        var brand = await references.BrandAsync(scope.WorkspaceId, ct);
        return new(CustomerDocumentKind.Invoice, number, draft.On, customer!.CustomerId, customer.CustomerName, book.BaseCurrency,
            rows.Sum(x => x.Net + x.Tax), rows.ToArray(), brand, DueOn: draft.DueOn ?? draft.On);
    }

    private async Task<CustomerTerms> ReceiptAsync(ResourceScope scope, AccountingBook book, CustomerDraft draft, string number, CancellationToken ct)
    {
        var customer = await references.CustomerAsync(scope.WorkspaceId, Required(draft.CustomerId), ct);
        var bank = await BankAsync(scope, draft.BankId, ct);
        return new(CustomerDocumentKind.Receipt, number, draft.On, customer.Id, customer.Name, book.BaseCurrency, draft.Amount, BankId: bank.Id);
    }

    private async Task<CustomerTerms> SettlementAsync(ResourceScope scope, AccountingBook book, CustomerDraft draft, string number,
        bool refund, CancellationToken ct)
    {
        var funds = await FundsAsync(scope, draft.FundsId, ct);
        DemandBalance(funds, draft.On, draft.Amount);
        if (refund)
        {
            var bank = await BankAsync(scope, draft.BankId, ct);
            return new(CustomerDocumentKind.Refund, number, draft.On, funds.Terms.CustomerId, funds.Terms.CustomerName,
                book.BaseCurrency, draft.Amount, BankId: bank.Id, FundsId: funds.Id);
        }
        var invoice = await InvoiceDocumentAsync(scope, draft.InvoiceId, ct);
        if (funds.Terms.CustomerId != invoice.Terms.CustomerId) throw new LedgerRuleException("The receipt and invoice belong to different customers.");
        DemandBalance(invoice, draft.On, draft.Amount);
        return new(CustomerDocumentKind.Allocation, number, draft.On, invoice.Terms.CustomerId, invoice.Terms.CustomerName,
            book.BaseCurrency, draft.Amount, InvoiceId: invoice.Id, FundsId: funds.Id);
    }

    private async Task<CustomerTerms> CreditAsync(ResourceScope scope, AccountingBook book, CustomerDraft draft, string number, CancellationToken ct)
    {
        var invoice = await InvoiceDocumentAsync(scope, draft.InvoiceId, ct);
        var returned = await ShipmentAsync(scope, Required(draft.ReturnId), ct);
        if (returned.Fact.ReversesId is not Guid originalId || draft.On < invoice.Terms.On || draft.On < returned.Fact.On)
            throw new LedgerRuleException("Credit must follow the original invoice and stock return.");
        var original = await ShipmentAsync(scope, originalId, ct);
        var line = invoice.Terms.Lines!.SingleOrDefault(x => x.ShipmentId == originalId)
            ?? throw new LedgerRuleException("The invoice did not bill this returned shipment.");
        var used = await CreditedLineAsync(scope, invoice.Id, originalId, ct);
        var quantity = draft.ReturnQuantity;
        ValidateCredit(original, returned, line, used, quantity);

        var components = line.Components.Select(tax => tax with
        {
            Amount = Allocate(tax.Amount, line.Quantity, used + quantity, book.MinorUnits)
                - Allocate(tax.Amount, line.Quantity, used, book.MinorUnits)
        }).ToArray();
        var net = Allocate(line.Net, line.Quantity, used + quantity, book.MinorUnits)
            - Allocate(line.Net, line.Quantity, used, book.MinorUnits);
        var credit = line with { Quantity = quantity, Net = net, Tax = components.Sum(x => x.Amount), Components = components };
        return new(CustomerDocumentKind.Credit, number, draft.On, invoice.Terms.CustomerId, invoice.Terms.CustomerName,
            book.BaseCurrency, credit.Net + credit.Tax, [credit], invoice.Terms.Brand, InvoiceId: invoice.Id, ReturnId: returned.Id);
    }

    private async Task<TaxAmounts> TaxAsync(ResourceScope scope, AccountingBook book, DateOnly on, Guid itemId, Guid customerId,
        decimal unitPrice, decimal quantity, CancellationToken ct, decimal? allocatedNet = null)
    {
        var classifications = await taxes.ClassificationsAsync(scope, itemId, customerId, ct);
        var groupCode = (classifications.SingleOrDefault(x => x.Kind == "partner") ?? classifications.SingleOrDefault(x => x.Kind == "item"))?.GroupCode;
        var group = (await taxes.GroupsAsync(scope, ct)).SingleOrDefault(x => x.Code == groupCode)
            ?? throw new LedgerRuleException("Set an applicable tax group for the customer or item.");
        var history = await taxes.RatesAsync(scope, ct);
        var rates = group.RateCodes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(code => history.Where(x => x.Code == code && x.EffectiveOn <= on).MaxBy(x => x.EffectiveOn)
                ?? throw new LedgerRuleException("The invoice tax group has no effective rate on this date.")).ToArray();
        var lineNet = Math.Round(unitPrice * quantity, book.MinorUnits, MidpointRounding.AwayFromZero);
        return TaxCalculation.Calculate(book.MinorUnits, unitPrice, quantity, 0, false, rates,
            allocatedNet == lineNet ? null : allocatedNet);
    }

    private async Task<decimal> CreditedLineAsync(ResourceScope scope, Guid invoiceId, Guid shipmentId, CancellationToken ct) =>
        (await receivables.CreditsAsync(scope, invoiceId, ct)).SelectMany(x => x.Terms.Lines!)
            .Where(x => x.ShipmentId == shipmentId).Sum(x => x.Quantity);

    private static void ValidateCredit(ReceiptAccrual original, ReceiptAccrual returned, InvoiceLine line, decimal used, decimal quantity)
    {
        if (quantity <= 0 || Math.Round(quantity, 6) != quantity || quantity > line.Quantity - used
            || quantity > original.AvailableSalesCredit || returned.Fact.ReversesId != original.Id
            || quantity > returned.Fact.Quantity - returned.CreditedQuantity)
            throw new LedgerRuleException("Credit exceeds the returned and invoiced quantity.");
    }
}
