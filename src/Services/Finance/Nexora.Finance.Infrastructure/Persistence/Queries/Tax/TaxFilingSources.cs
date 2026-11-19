using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal sealed class TaxFilingSources(FinanceDbContext db)
{
    public async Task<TaxPosting[]> ReadAsync(ResourceScope scope, TaxPeriod period, long watermark, int minorUnits, CancellationToken ct)
    {
        var journals = db.Set<Journal>().AsNoTracking()
            .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.State == JournalState.Posted
                && x.PostingNumber <= watermark && x.On >= period.From && x.On <= period.Through);
        var customers = await (from doc in db.Set<CustomerDocument>().AsNoTracking()
            where doc.TenantId == scope.TenantId && doc.WorkspaceId == scope.WorkspaceId && doc.State == CustomerDocumentState.Posted
            join journal in journals on doc.JournalId equals (Guid?)journal.Id
            select new { Document = doc, journal.On, PostingNumber = journal.PostingNumber!.Value, JournalId = journal.Id }).ToArrayAsync(ct);
        var result = new List<TaxPosting>();
        foreach (var row in customers)
        {
            var kind = row.Document.Terms.Kind;
            if (kind is not (CustomerDocumentKind.Invoice or CustomerDocumentKind.Credit)) continue;
            var sign = kind == CustomerDocumentKind.Credit ? -1 : 1;
            foreach (var tax in row.Document.Terms.Lines!.SelectMany(line => line.Components))
                result.Add(new(row.On, row.PostingNumber, row.JournalId, row.Document.Id, row.Document.Number,
                    sign == 1 ? "sales-invoice" : "sales-credit", "output", tax.Code, tax.Amount * sign));
        }

        var trade = db.Set<TradeDocument>().AsNoTracking().Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId
            && x.State == TradeState.Posted);
        var suppliers = await (from doc in trade
            join journal in journals on doc.JournalId equals (Guid?)journal.Id
            select new { Document = doc, journal.On, PostingNumber = journal.PostingNumber!.Value, JournalId = journal.Id }).ToArrayAsync(ct);
        var bills = suppliers.Where(x => x.Document.Terms.Kind == TradeKind.Bill).ToArray();
        var credits = suppliers.Where(x => x.Document.Terms.Kind == TradeKind.SupplierCredit).ToArray();
        var billIds = credits.Select(x => x.Document.Terms.SourceId!.Value).Except(bills.Select(x => x.Document.Id)).ToArray();
        var originalBills = billIds.Length == 0 ? [] : await trade.Where(x => billIds.Contains(x.Id)).ToArrayAsync(ct);
        var documents = bills.Select(x => x.Document).Concat(originalBills).ToDictionary(x => x.Id);
        var assessmentIds = documents.Values.SelectMany(BillInputs).Where(x => x.TaxAssessmentId.HasValue)
            .Select(x => x.TaxAssessmentId!.Value).Distinct().ToArray();
        var assessments = assessmentIds.Length == 0 ? [] : await db.Set<TaxAssessment>().AsNoTracking()
            .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && assessmentIds.Contains(x.Id)).ToArrayAsync(ct);
        var components = assessments.ToDictionary(x => x.Id,
            x => JsonSerializer.Deserialize<TaxSnapshot>(x.SnapshotJson)!.Amounts.Components);
        foreach (var row in bills)
            foreach (var input in BillInputs(row.Document))
                foreach (var tax in Components(input, components))
                    result.Add(new(row.On, row.PostingNumber, row.JournalId, row.Document.Id, row.Document.Number,
                        "supplier-bill", "input", tax.Code, tax.Amount));

        if (credits.Length > 0)
        {
            var returnedIds = credits.Select(x => x.Document.Terms.ReturnReceiptId!.Value).Distinct().ToArray();
            var returned = await db.Set<ReceiptAccrual>().AsNoTracking()
                .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && returnedIds.Contains(x.Id)).ToArrayAsync(ct);
            var origins = returned.ToDictionary(x => x.Id, x => x.Fact.ReversesId);
            var creditJournalIds = credits.Select(x => x.JournalId).ToArray();
            var inputAccount = await db.Set<TradeSetup>().AsNoTracking()
                .Where(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId)
                .Select(x => x.InputTaxAccountId).SingleAsync(ct);
            var creditTaxes = await (from journal in journals
                where creditJournalIds.Contains(journal.Id)
                from line in journal.Lines
                where line.AccountId == inputAccount
                group line by journal.Id into lines
                select new { JournalId = lines.Key, Amount = lines.Sum(x => x.Credit - x.Debit) }).ToDictionaryAsync(x => x.JournalId, x => x.Amount, ct);
            foreach (var row in credits)
            {
                var amount = creditTaxes.GetValueOrDefault(row.JournalId);
                if (amount == 0) continue;
                var terms = row.Document.Terms;
                var original = documents[terms.SourceId!.Value];
                var originalReceipt = origins.GetValueOrDefault(terms.ReturnReceiptId!.Value);
                var input = BillInputs(original).SingleOrDefault(x => x.ReceiptId == originalReceipt);
                foreach (var (code, tax) in AllocateCredit(input is null ? [] : Components(input, components), amount, minorUnits))
                    result.Add(new(row.On, row.PostingNumber, row.JournalId, row.Document.Id, row.Document.Number,
                        "supplier-credit", "input", code, -tax));
            }
        }

        return result.GroupBy(x => x with { Amount = 0 }).Select(g => g.Key with { Amount = g.Sum(x => x.Amount) })
            .OrderBy(x => x.On).ThenBy(x => x.PostingNumber).ThenBy(x => x.Code, StringComparer.Ordinal).ToArray();
    }

    private static BillReceiptInput[] BillInputs(TradeDocument doc) => doc.Terms.BillReceipts ??
        [new(doc.Terms.SourceId!.Value, doc.Terms.Quantity, doc.Terms.Amount, doc.Terms.TaxAssessmentId)];

    private static IReadOnlyList<TaxAmount> Components(BillReceiptInput input,
        Dictionary<Guid, IReadOnlyList<TaxAmount>> assessments) =>
        input.TaxAssessmentId is Guid id ? assessments[id] : [];

    private static IEnumerable<(string Code, decimal Tax)> AllocateCredit(IReadOnlyList<TaxAmount> source, decimal amount, int minorUnits)
    {
        var total = source.Sum(x => x.Amount);
        if (total == 0)
        {
            yield return ("UNALLOCATED", amount);
            yield break;
        }
        decimal running = 0, allocated = 0;
        foreach (var item in source.OrderBy(x => x.Code, StringComparer.Ordinal))
        {
            running += item.Amount;
            var next = Math.Round(amount * running / total, minorUnits, MidpointRounding.AwayFromZero);
            yield return (item.Code, next - allocated);
            allocated = next;
        }
    }
}
