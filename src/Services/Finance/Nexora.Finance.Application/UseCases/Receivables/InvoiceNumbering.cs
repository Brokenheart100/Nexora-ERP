using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class ReceivableUseCases
{
    public async Task<InvoiceNumberingView> NumberingAsync(Guid workspace, CancellationToken ct)
    {
        var (_, book) = await access.ReadAsync(workspace, ct);
        return Numbering(book);
    }

    public async Task<InvoiceNumberingView> ConfigureNumberingAsync(ConfigureInvoiceNumbering command, CancellationToken ct)
    {
        const string action = "receivables.numbering-configured";
        var (current, book) = await access.LockAsync(command.WorkspaceId, ChartPermissions.Manage, ct);
        if (await mutations.ReplayAsync(current, command.OperationId, action, command, ct) is not null) return Numbering(book);
        if (book.InvoiceNumberVersion != command.ExpectedVersion)
            throw new RevisionConflictException("Invoice numbering settings have changed.");
        if (string.IsNullOrWhiteSpace(command.Pattern) && book.InvoiceNumberPattern is not null
            && await receivables.HasUnnumberedInvoicesAsync(current.Scope, ct))
            throw new LedgerRuleException("Post or cancel unnumbered invoices before disabling fiscal numbering.");
        book.ConfigureInvoiceNumbers(command.Pattern, command.StartingNumber);
        Record(current, command.OperationId, action, command, book.WorkspaceId, book.InvoiceNumberVersion);
        return Numbering(book);
    }

    public async Task<InvoiceNumberPreview> PreviewNumberAsync(Guid workspace, DateOnly on, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspace, ct);
        return await NextNumberAsync(current.Scope, book, on, ct);
    }

    private async Task<InvoiceNumberPreview> NextNumberAsync(ResourceScope scope, AccountingBook book, DateOnly on, CancellationToken ct)
    {
        if (on < book.StartsOn || on.Year > 9998) throw new ArgumentException("Choose a valid invoice date for this book.");
        book.DemandTaxDateOpen(on);
        var pattern = book.InvoiceNumberPattern ?? throw new LedgerRuleException("Fiscal invoice numbering is disabled.");
        var year = FiscalInvoiceNumber.Year(on, book.FiscalYearStartMonth);
        var next = Math.Max(book.InvoiceNumberStart, 1 + await receivables.LastSequenceAsync(scope, year, ct));
        for (; next <= FiscalInvoiceNumber.Limit; next++)
        {
            var number = FiscalInvoiceNumber.Format(pattern, year, next);
            if (!await receivables.NumberExistsAsync(scope, number, ct)) return new(number, year, next);
        }
        throw new LedgerRuleException("Invoice numbers have been exhausted for this fiscal year.");
    }

    private static InvoiceNumberingView Numbering(AccountingBook book) =>
        new(book.InvoiceNumberPattern, book.InvoiceNumberStart, book.InvoiceNumberVersion);
}
