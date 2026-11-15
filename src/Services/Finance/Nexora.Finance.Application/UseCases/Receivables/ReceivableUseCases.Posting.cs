using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class ReceivableUseCases
{
    private async Task PostAsync(ResourceScope scope, AccountingBook book, CustomerDocument doc, JournalActor reviewer, CancellationToken ct)
    {
        var accounts = await SetupAsync(scope, ct);
        var t = doc.Terms;
        var lines = new List<PostLine>();
        BankAccount? bank = null;
        decimal bankDelta = 0, openBalance = 0;
        switch (t.Kind)
        {
            case CustomerDocumentKind.Invoice:
                foreach (var row in t.Lines!.Where(x => x.ShipmentId.HasValue))
                {
                    var shipment = await ShipmentAsync(scope, row.ShipmentId!.Value, ct);
                    if (await trade.HasPendingReturnAsync(scope, shipment.Id, ct))
                        throw new LedgerRuleException("Post the pending stock return before invoicing this shipment.");
                    shipment.BillShipment(row.Quantity, row.Net, book.MinorUnits);
                }
                openBalance = t.Total;
                lines.Add(new(accounts.ReceivableAccountId, t.Total));
                lines.Add(new(accounts.RevenueAccountId, -t.Lines!.Sum(x => x.Net)));
                lines.Add(new(accounts.OutputTaxAccountId, -t.Lines!.Sum(x => x.Tax)));
                break;
            case CustomerDocumentKind.Receipt:
                openBalance = t.Total;
                bank = await BankAsync(scope, t.BankId, ct);
                bankDelta = t.Total;
                lines.Add(new(accounts.AdvanceAccountId, -t.Total));
                break;
            case CustomerDocumentKind.Allocation:
                var invoice = await InvoiceDocumentAsync(scope, t.InvoiceId, ct);
                var funds = await FundsAsync(scope, t.FundsId, ct);
                invoice.Consume(t.CustomerId, t.On, t.Total);
                funds.Consume(t.CustomerId, t.On, t.Total);
                lines.Add(new(accounts.AdvanceAccountId, t.Total));
                lines.Add(new(accounts.ReceivableAccountId, -t.Total));
                break;
            case CustomerDocumentKind.Credit:
                var billed = await InvoiceDocumentAsync(scope, t.InvoiceId, ct);
                var returned = await ShipmentAsync(scope, Required(t.ReturnId), ct);
                var rowCredit = t.Lines!.Single();
                var original = await ShipmentAsync(scope, rowCredit.ShipmentId!.Value, ct);
                var originalLine = billed.Terms.Lines!.Single(x => x.ShipmentId == original.Id);
                var credited = await CreditedLineAsync(scope, billed.Id, original.Id, ct);
                ValidateCredit(original, returned, originalLine, credited, rowCredit.Quantity);
                var expectedCredit = Allocate(originalLine.Net, originalLine.Quantity, credited + rowCredit.Quantity, book.MinorUnits)
                    - Allocate(originalLine.Net, originalLine.Quantity, credited, book.MinorUnits);
                var expectedTax = originalLine.Components.Sum(x =>
                    Allocate(x.Amount, originalLine.Quantity, credited + rowCredit.Quantity, book.MinorUnits)
                    - Allocate(x.Amount, originalLine.Quantity, credited, book.MinorUnits));
                if (expectedCredit != rowCredit.Net || expectedTax != rowCredit.Tax)
                    throw new LedgerRuleException("Another credit changed rounding. Cancel and resubmit the draft.");
                original.CreditShipment(rowCredit.Quantity);
                returned.ConsumeSalesReturn(rowCredit.Quantity);
                var applied = Math.Min(billed.OpenBalance, t.Total);
                if (applied > 0) billed.Consume(t.CustomerId, t.On, applied);
                openBalance = t.Total - applied;
                lines.Add(new(accounts.RevenueAccountId, rowCredit.Net));
                lines.Add(new(accounts.OutputTaxAccountId, rowCredit.Tax));
                lines.Add(new(accounts.ReceivableAccountId, -applied));
                lines.Add(new(accounts.AdvanceAccountId, -openBalance));
                break;
            case CustomerDocumentKind.Refund:
                (await FundsAsync(scope, t.FundsId, ct)).Consume(t.CustomerId, t.On, t.Total);
                bank = await BankAsync(scope, t.BankId, ct);
                bankDelta = -t.Total;
                lines.Add(new(accounts.AdvanceAccountId, t.Total));
                break;
        }
        if (bank is not null) lines.Add(new(bank.AccountId, bankDelta));
        var journal = await posting.PostAsync(scope, book, doc.Id, t.Number, t.On, $"Customer {t.Kind.ToString().ToLowerInvariant()}",
            new(doc.MakerIssuer, doc.MakerSubject), reviewer, lines, ct);
        if (bank is not null)
        {
            bank.Apply(bankDelta);
            trade.Add(new BankMovement(bank, doc.Id, t.On, journal, bankDelta));
        }
        doc.Post(journal, openBalance);
    }
}
