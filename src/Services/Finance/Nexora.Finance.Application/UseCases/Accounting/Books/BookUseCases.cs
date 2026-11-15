using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class BookUseCases(IBookAccess access, IBookStore store, TimeProvider clock)
{
    public async Task<BookView> ReadAsync(Guid workspaceId, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        var book = await store.FindAsync(current.Scope, ct);
        return book is null
            ? new(current.IsPersonal, current.CanInitialize, null, [])
            : View(book, current.CanInitialize, await store.ListAccountsAsync(current.Scope, ct));
    }

    public async Task<BookView> InitializeAsync(InitializeBook command, CancellationToken ct)
    {
        var current = await access.DemandAsync(command.WorkspaceId, true, ct);
        var currency = command.BaseCurrency.Trim().ToUpperInvariant();
        var existing = await store.FindAsync(current.Scope, ct);
        if (existing is not null)
        {
            if (existing.OperationId != command.OperationId || existing.BaseCurrency != currency
                || existing.StartsOn != command.StartsOn || existing.FiscalYearStartMonth != command.FiscalYearStartMonth)
                throw new BusinessConflictException("The accounting book has already been initialized.");
            return View(existing, true, await store.ListAccountsAsync(current.Scope, ct));
        }
        var book = new AccountingBook(current.Scope.WorkspaceId, current.Scope.TenantId, current.IsPersonal,
            command.OperationId, currency, command.StartsOn, command.FiscalYearStartMonth, current.Actor.Issuer,
            current.Actor.Subject, clock.GetUtcNow());
        var accounts = ChartAccount.StarterChart(book);
        store.Add(book, accounts);
        return View(book, true, accounts);
    }

    private static BookView View(AccountingBook book, bool canInitialize, IEnumerable<ChartAccount> accounts) =>
        new(book.IsPersonal, canInitialize,
            new(book.BaseCurrency, book.MinorUnits, book.StartsOn, book.FiscalYearStartMonth, book.Template),
            accounts.Select(account => new StarterAccountView(account.Id, account.Code, account.Name,
                account.Category.ToString().ToLowerInvariant())).ToArray());
}
