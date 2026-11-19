using System.Security.Cryptography;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class LedgerUseCases
{
    public async Task<LedgerChange> ImportAsync(ImportJournal command, CancellationToken ct)
    {
        const string action = "journal.imported";
        var (current, book) = await BeginAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        if (await mutations.ReplayAsync(current, command.OperationId, action, command, ct) is { } replay) return Change(replay);
        var provider = command.Provider?.Trim().ToLowerInvariant() ?? "";
        var externalId = command.ExternalId?.Trim() ?? "";
        if (provider.Length is < 1 or > 40 || provider.Any(x => !char.IsAsciiLetterOrDigit(x) && x is not ('-' or '_'))
            || externalId.Length is < 1 or > 80 || externalId.Any(char.IsControl))
            throw new ArgumentException("A valid import provider and source identifier are required.");
        if (await store.ImportedSourceExistsAsync(current.Scope, provider, externalId, ct))
            throw new BusinessConflictException("A journal has already been imported from this source.");
        var draft = RequiredDraft(command.Draft);
        current.DemandOn(LedgerPermissions.Draft, draft.On);
        await DemandOpenAsync(current.Scope, book, draft.On, ct);
        var lines = await ResolveLinesAsync(current.Scope, JournalKind.Imported, draft.Lines, ct);
        var key = "import:" + Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(new[] { provider, externalId })));
        var journal = Journal.Import(book, provider, externalId, key, draft.On, draft.Memo, Actor(current), lines, clock.GetUtcNow(),
            ParseCashActivity(draft.CashActivity));
        store.Add(journal);
        book.RegisterAccountingActivity();
        return Record(current, command.OperationId, action, command, journal);
    }

    public async Task<LedgerChange[]> DecideImportedAsync(DecideImportedJournals command, CancellationToken ct)
    {
        var permission = command.Decision switch
        {
            "submit" or "cancel" => LedgerPermissions.Draft,
            "post" => LedgerPermissions.Post,
            _ => throw new ArgumentException("Unknown journal decision.")
        };
        var entries = command.Journals;
        if (entries is not { Length: >= 1 and <= 50 }
            || entries.Any(x => x is null || x.Id == Guid.Empty || x.Version < 1 || x.Version == long.MaxValue)
            || entries.Select(x => x.Id).Distinct().Count() != entries.Length)
            throw new ArgumentException("Choose between one and fifty distinct journal versions.");
        var action = $"journal.import-batch-{command.Decision}";
        var (current, book) = await BeginAsync(command.WorkspaceId, permission, ct);
        if (await mutations.ReplayAsync(current, command.OperationId, action, command, ct) is not null)
            return entries.Select(x => new LedgerChange(x.Id, x.Version + 1)).ToArray();
        var results = new List<LedgerChange>(entries.Length);
        foreach (var entry in entries)
        {
            var journal = await LoadAsync(current.Scope, entry.Id, entry.Version, ct);
            if (journal.Kind != JournalKind.Imported) throw new LedgerRuleException("This batch only accepts imported journals.");
            current.DemandOn(permission, journal.On);
            if (command.Decision != "cancel") await DemandOpenAsync(current.Scope, book, journal.On, ct);
            switch (command.Decision)
            {
                case "submit": journal.Submit(Actor(current)); break;
                case "cancel": journal.Cancel(Actor(current)); break;
                case "post": await PostPendingAsync(current, book, journal, ct); break;
            }
            results.Add(new(journal.Id, journal.Version));
        }
        mutations.Record(current, command.OperationId, action, command, results[0].Id, results[0].Version);
        return results.ToArray();
    }
}
