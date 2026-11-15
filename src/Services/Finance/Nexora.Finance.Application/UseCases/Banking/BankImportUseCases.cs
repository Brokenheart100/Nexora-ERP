using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.VisualBasic.FileIO;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class BankImportUseCases(TradeAccess access, IStatementStore statements, ITradeStore trade, StatementAllocation allocation,
    FinanceMutation mutations, TradePosting posting, TimeProvider clock, BankCutoff cutoff)
{
    public async Task<BankPreviewView> PreviewAsync(PreviewBankImport command, CancellationToken ct)
    {
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        await DemandBankAsync(current.Scope, command.BankId, ct);
        if (command.File is not { Length: >= 1 and <= 262144 } || command.Mapping is null)
            throw new ArgumentException("A CSV file up to 256 Ki characters and its column mapping are required.");
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(command.File)));
        var (rows, issues) = Parse(command.File, command.Mapping, book);
        var existing = (await statements.ExistingAsync(current.Scope, command.BankId, rows.Select(x => x.ExternalId).ToArray(), ct))
            .ToDictionary(x => x.ExternalId, StringComparer.Ordinal);
        foreach (var row in rows)
            if (existing.TryGetValue(row.ExternalId, out var prior) && !prior.Matches(row))
                issues.Add(new(row.Row, "The statement reference already exists with different content."));
        var views = rows.Select(x => new StatementPreviewRow(x, existing.ContainsKey(x.ExternalId))).ToArray();
        if (issues.Count > 0) return new(null, hash, views, issues.ToArray());
        var preview = new BankImportPreview(current, command.BankId, hash, rows, clock.GetUtcNow().AddMinutes(20));
        statements.Add(preview);
        return new(preview.Id, hash, views, []);
    }

    public async Task<BankImportResult> CommitAsync(CommitBankImport command, CancellationToken ct)
    {
        const string action = "trade.statement.imported";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return new(replay.TargetId!.Value, (int)replay.ResultVersion);
        var preview = await statements.PreviewAsync(current, command.PreviewId, ct) ?? throw new ResourceNotFoundException();
        if (preview.CommittedCount is int committed) return new(preview.Id, committed);
        if (clock.GetUtcNow() >= preview.ExpiresAtUtc) throw new LedgerRuleException("Import preview expired.");
        await DemandBankAsync(current.Scope, preview.BankId, ct);
        var rows = preview.Read();
        var existing = (await statements.ExistingAsync(current.Scope, preview.BankId, rows.Select(x => x.ExternalId).ToArray(), ct))
            .ToDictionary(x => x.ExternalId, StringComparer.Ordinal);
        var newRows = rows.Where(x => !existing.ContainsKey(x.ExternalId)).ToArray();
        if (newRows.Length > 0) await cutoff.DemandOpenAsync(current.Scope, preview.BankId, newRows.Min(x => x.On), ct);
        var count = 0;
        foreach (var row in rows)
        {
            if (existing.TryGetValue(row.ExternalId, out var prior))
            {
                if (!prior.Matches(row)) throw new LedgerRuleException("Statement reference changed after preview.");
                continue;
            }
            statements.Add(new StatementLine(current.Scope.TenantId, current.Scope.WorkspaceId, preview.BankId, preview.Id, row));
            count++;
        }
        preview.Complete(count);
        mutations.Record(current, command.OperationId, action, command, preview.Id, count);
        return new(preview.Id, count);
    }

    public async Task<StatementLine[]> ListAsync(Guid workspace, Guid bankId, int page, CancellationToken ct)
    {
        if (page is < 1 or > 100_000) throw new ArgumentException("Invalid page.");
        var (current, _) = await access.ReadAsync(workspace, ct);
        await DemandBankAsync(current.Scope, bankId, ct);
        return await statements.ListAsync(current.Scope, bankId, page, ct);
    }

    public async Task<StatementMatch[]> MatchesAsync(Guid workspace, Guid lineId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspace, ct);
        _ = await statements.LineAsync(current.Scope, lineId, ct) ?? throw new ResourceNotFoundException();
        return await statements.MatchesAsync(current.Scope, lineId, ct);
    }

    public async Task<TradeChange> MatchAsync(MatchStatement command, CancellationToken ct)
    {
        const string action = "trade.statement.matched";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return new(replay.TargetId!.Value, replay.ResultVersion);
        var line = await LineAsync(current.Scope, command.LineId, command.ExpectedVersion, ct);
        var movement = await trade.MovementAsync(current.Scope, command.MovementId, ct) ?? throw new ResourceNotFoundException();
        if (Math.Round(command.Amount, book.MinorUnits) != command.Amount) throw new ArgumentException("Invalid matching amount precision.");
        var result = await allocation.AttachAsync(current.Scope, book, command.OperationId, line.Id, movement, command.Amount, ct);
        mutations.Record(current, command.OperationId, action, command, result.Id, line.Version);
        return new(result.Id, line.Version);
    }

    public async Task<TradeChange> ReleaseAsync(ReleaseMatch command, CancellationToken ct)
    {
        const string action = "trade.statement.match-released";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return new(replay.TargetId!.Value, replay.ResultVersion);
        if (string.IsNullOrWhiteSpace(command.Reason) || command.Reason.Length > 300) throw new ArgumentException("A release reason is required.");
        var match = await statements.MatchAsync(current.Scope, command.MatchId, ct) ?? throw new ResourceNotFoundException();
        var line = await statements.LineAsync(current.Scope, match.StatementLineId, ct) ?? throw new ResourceNotFoundException();
        await allocation.ReleaseAsync(current.Scope, book, match, ct);
        mutations.Record(current, command.OperationId, action, command, match.Id, line.Version);
        return new(match.Id, line.Version);
    }

    public async Task<TradeChange> ExcludeAsync(ExcludeStatement command, CancellationToken ct)
    {
        const string action = "trade.statement.excluded";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Post, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return new(replay.TargetId!.Value, replay.ResultVersion);
        if (string.IsNullOrWhiteSpace(command.Reason) || command.Reason.Length > 300) throw new ArgumentException("An exclusion reason is required.");
        var line = await LineAsync(current.Scope, command.LineId, command.ExpectedVersion, ct);
        var gate = await posting.GateAsync(current.Scope, book, line.On, ct);
        if (gate is not null) throw new LedgerRuleException(gate);
        await cutoff.DemandOpenAsync(current.Scope, line.BankId, line.On, ct);
        line.Exclude(command.Exclude);
        mutations.Record(current, command.OperationId, action, command, line.Id, line.Version);
        return new(line.Id, line.Version);
    }

    private async Task<StatementLine> LineAsync(ResourceScope scope, Guid id, long version, CancellationToken ct)
    {
        var line = await statements.LineAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
        if (line.Version != version) throw new RevisionConflictException("Statement line version changed.");
        return line;
    }

    private async Task DemandBankAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        if (await trade.BankAsync(scope, id, ct) is null) throw new ResourceNotFoundException();
    }

    private static (StatementEntry[], List<StatementIssue>) Parse(string text, BankCsvMapping mapping, AccountingBook book)
    {
        var rows = new List<StatementEntry>();
        var issues = new List<StatementIssue>();
        var ids = new HashSet<string>(StringComparer.Ordinal);
        using var csv = new TextFieldParser(new StringReader(text.TrimStart('\uFEFF'))) { TrimWhiteSpace = true };
        csv.SetDelimiters(",");
        csv.HasFieldsEnclosedInQuotes = true;
        try
        {
            var header = csv.ReadFields() ?? [];
            var mapped = new[] { mapping.ExternalId, mapping.Date, mapping.Amount, mapping.Description };
            var indices = mapped.Select(x => Array.IndexOf(header, x)).ToArray();
            if (header.Length is < 4 or > 40 || header.Distinct(StringComparer.Ordinal).Count() != header.Length
                || indices.Any(x => x < 0) || indices.Distinct().Count() != 4)
                return ([], [new(1, "CSV headers do not match the four distinct mapped columns.")]);
            var count = 0;
            while (!csv.EndOfData)
            {
                var number = checked((int)csv.LineNumber);
                if (++count > 300) { issues.Add(new(number, "A batch is limited to 300 rows.")); break; }
                var fields = csv.ReadFields() ?? [];
                if (fields.Length != header.Length) { issues.Add(new(number, "Wrong number of columns.")); continue; }
                var id = fields[indices[0]];
                var date = fields[indices[1]];
                var amount = fields[indices[2]];
                var description = fields[indices[3]];
                if (id.Length is < 1 or > 120 || description.Length > 300
                    || !DateOnly.TryParseExact(date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var on)
                    || on < book.StartsOn || on.Year > 9998 || amount.Length is < 1 or > 24
                    || !decimal.TryParse(amount, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                        CultureInfo.InvariantCulture, out var value)
                    || value == 0 || Math.Abs(value) > 1_000_000_000_000m || Math.Round(value, book.MinorUnits) != value)
                { issues.Add(new(number, "Invalid reference, date, signed amount or description.")); continue; }
                if (!ids.Add(id)) { issues.Add(new(number, "Duplicate reference in this file.")); continue; }
                rows.Add(new(number, id, on, value, description));
            }
        }
        catch (MalformedLineException error) { issues.Add(new((int)error.LineNumber, "Malformed CSV row.")); }
        if (rows.Count == 0 && issues.Count == 0) issues.Add(new(1, "The CSV file contains no statement rows."));
        return (rows.ToArray(), issues);
    }
}
