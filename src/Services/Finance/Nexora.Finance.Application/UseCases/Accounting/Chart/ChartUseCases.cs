using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class ChartUseCases(IBookAccess access, IChartStore store, TimeProvider clock, ILedgerStore ledger)
{
    public async Task<ChartView> ReadAsync(Guid workspaceId, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        var state = await store.ReadAsync(current.Scope, ct) ?? throw new ResourceNotFoundException();
        return new(state.Book.ChartRevision, current.Allows(ChartPermissions.Manage), current.Allows(ChartPermissions.Import),
            current.Allows(ChartPermissions.Export), Views(state.Accounts));
    }

    public async Task<object> ExportAsync(Guid workspaceId, string kind, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        current.Demand(ChartPermissions.Export);
        var state = await store.ReadAsync(current.Scope, ct) ?? throw new ResourceNotFoundException();
        var book = state.Book;
        if (kind == "template")
            return new ChartExportView("nexora.chart-structure.v1", book.Template, Inputs(ChartAccount.StarterChart(book)));
        return kind switch
        {
            "structure" => new ChartExportView("nexora.chart-structure.v1", book.Template, Inputs(state.Accounts)),
            "snapshot" => new ChartSnapshotView("nexora.chart-snapshot.v1", book.Template, workspaceId, book.ChartRevision, Views(state.Accounts)),
            _ => throw new ArgumentException("Invalid chart export kind.")
        };
    }

    public async Task<ChartRevisionResult> SaveAsync(SaveChartAccount command, CancellationToken ct)
    {
        var current = await access.DemandAsync(command.WorkspaceId, false, ct);
        current.Demand(ChartPermissions.Manage);
        var book = await LockAsync(current, ct);
        var fingerprint = Hash(JsonSerializer.Serialize(command));
        var receipt = await store.FindAuditAsync(current, command.OperationId, ct);
        if (receipt is not null)
        {
            if (receipt.Action != "chart.account.saved" || receipt.Fingerprint != fingerprint) throw new IdempotencyConflictException();
            return new(receipt.ResultVersion);
        }
        RequireRevision(book, command.ExpectedRevision);
        await DemandNoOpeningInProgressAsync(current.Scope, ct);
        var accounts = await store.ListAsync(current.Scope, true, ct);
        var desired = command.Account.Parse();
        var existing = accounts.SingleOrDefault(x => x.Code == desired.Code);
        if (existing?.Version != command.ExpectedVersion)
            throw new BusinessConflictException("The account already exists or its version changed.");
        var plan = Plan(book, accounts, [new(1, desired)], existing is null ? "append" : "upsert");
        if (plan.Errors.Count != 0) throw new BusinessConflictException(plan.Errors[0].Message);
        Apply(book, accounts, plan.Desired);
        Audit(current, command.OperationId, "chart.account.saved", fingerprint, null, book.ChartRevision);
        return new(book.ChartRevision);
    }

    public async Task<ChartPreviewView> PreviewAsync(PreviewChartImport command, CancellationToken ct)
    {
        var current = await access.DemandAsync(command.WorkspaceId, false, ct);
        current.Demand(ChartPermissions.Import);
        var book = await LockAsync(current, ct);
        var parsed = ChartFileReader.Read(command.Format, command.File);
        var hash = Hash(command.File);
        if (parsed.Errors.Count != 0) return new(null, book.ChartRevision, hash, [], parsed.Errors);
        var accounts = await store.ListAsync(current.Scope, false, ct);
        var plan = Plan(book, accounts, parsed.Accounts, command.Mode);
        if (plan.Errors.Count != 0) return new(null, book.ChartRevision, hash, plan.Changes, plan.Errors);
        var preview = new ChartImportPreview(current, command.Mode, command.Format, hash, book.ChartRevision, parsed.Accounts, clock.GetUtcNow());
        store.Add(preview);
        return new(preview.Id, book.ChartRevision, hash, plan.Changes, []);
    }

    public async Task<ChartRevisionResult> CommitAsync(CommitChartImport command, CancellationToken ct)
    {
        var current = await access.DemandAsync(command.WorkspaceId, false, ct);
        current.Demand(ChartPermissions.Import);
        var book = await LockAsync(current, ct);
        var preview = await store.FindPreviewAsync(current, command.PreviewId, ct) ?? throw new ResourceNotFoundException();
        if (preview.CommittedRevision is { } committed) return new(committed);
        if (preview.ExpiresAtUtc <= clock.GetUtcNow()) throw new BusinessConflictException("The import preview expired.");
        RequireRevision(book, preview.ChartRevision);
        await DemandNoOpeningInProgressAsync(current.Scope, ct);
        var accounts = await store.ListAsync(current.Scope, true, ct);
        var plan = Plan(book, accounts, preview.ReadRows(), preview.Mode);
        if (plan.Errors.Count != 0) throw new BusinessConflictException(plan.Errors[0].Message);
        Apply(book, accounts, plan.Desired);
        preview.Complete(book.ChartRevision);
        Audit(current, command.OperationId, "chart.import.committed", preview.FileHash, preview.Id, book.ChartRevision);
        return new(book.ChartRevision);
    }

    public async Task<ChartImportStatus> ImportStatusAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        current.Demand(ChartPermissions.Import);
        var preview = await store.FindPreviewAsync(current, id, ct) ?? throw new ResourceNotFoundException();
        var state = preview.CommittedRevision is not null ? "committed" : clock.GetUtcNow() >= preview.ExpiresAtUtc ? "expired" : "ready";
        return new(preview.Id, state, preview.ExpiresAtUtc, preview.ChartRevision, preview.CommittedRevision);
    }

    private async Task<AccountingBook> LockAsync(BookAccess current, CancellationToken ct) =>
        await store.LockBookAsync(current.Scope, ct) ?? throw new ResourceNotFoundException();

    private async Task DemandNoOpeningInProgressAsync(ResourceScope scope, CancellationToken ct)
    {
        if (await ledger.HasApplyingOpeningSubledgersAsync(scope, ct))
            throw new LedgerRuleException("Wait for the approved opening subledger batch to post.");
    }

    private static void RequireRevision(AccountingBook book, long expected)
    {
        if (book.ChartRevision != expected) throw new RevisionConflictException("The chart changed. Create a new preview.");
    }

    private void Apply(AccountingBook book, IReadOnlyList<ChartAccount> existing, IReadOnlyDictionary<string, AccountDefinition> desired)
    {
        var accounts = existing.ToDictionary(x => x.Code);
        var ids = desired.Keys.ToDictionary(code => code, code => accounts.TryGetValue(code, out var old) ? old.Id : Guid.CreateVersion7());
        foreach (var definition in desired.Values)
        {
            Guid? parentId = definition.ParentCode is { } parent ? ids[parent] : null;
            if (accounts.TryGetValue(definition.Code, out var account)) account.Apply(definition, parentId);
            else store.Add(ChartAccount.Create(book, definition, ids[definition.Code], parentId));
        }
        book.AdvanceChart();
    }

    private void Audit(BookAccess current, Guid operationId, string action, string fingerprint, Guid? target, long version) =>
        store.Add(new FinanceAudit(Guid.CreateVersion7(), current.Scope.TenantId, current.Scope.WorkspaceId,
            current.Actor.Issuer, current.Actor.Subject, operationId, action, fingerprint, target, version, clock.GetUtcNow()));

    private sealed record ImportPlan(Dictionary<string, AccountDefinition> Desired, List<ChartImportChange> Changes, List<ChartImportIssue> Errors);

    private static ImportPlan Plan(AccountingBook book, IReadOnlyList<ChartAccount> existing, IReadOnlyList<ImportedAccount> rows, string mode)
    {
        var accounts = existing.ToDictionary(x => x.Code);
        var codes = existing.ToDictionary(x => x.Id, x => x.Code);
        var original = existing.ToDictionary(x => x.Code, x => Definition(x, codes));
        var desired = new Dictionary<string, AccountDefinition>(original);
        var errors = new List<ChartImportIssue>();
        var changes = new List<ChartImportChange>();
        if (mode is not ("append" or "upsert" or "replace"))
            errors.Add(new(null, null, "不支持该导入模式。"));
        if (mode == "replace" && (book.HasAccountingActivity || existing.Any(x => x.IsUsed)))
            errors.Add(new(null, null, "存在会计活动的账簿不能替换科目结构。"));
        var imported = new Dictionary<string, long>();
        foreach (var row in rows)
        {
            var definition = row.Definition;
            if (!imported.TryAdd(definition.Code, row.Row))
            {
                errors.Add(new(row.Row, definition.Code, "科目编码重复。"));
                continue;
            }
            if (accounts.TryGetValue(definition.Code, out var account))
            {
                if (mode == "append") errors.Add(new(row.Row, definition.Code, "编码已存在。"));
                if (account.Category != definition.Category || (account.IsUsed && account.Purpose != definition.Purpose))
                    errors.Add(new(row.Row, definition.Code, "类别固定，已使用科目的用途固定。"));
            }
            var action = account is null ? "add" : original[definition.Code] == definition ? "keep" : "update";
            changes.Add(new(row.Row, definition.Code, definition.Name, action));
            desired[definition.Code] = definition;
        }
        if (mode == "replace")
            foreach (var old in original.Values.Where(x => !x.IsArchived && !imported.ContainsKey(x.Code)))
            {
                desired[old.Code] = old with { IsArchived = true };
                changes.Add(new(null, old.Code, old.Name, "archive"));
            }
        if (desired.Count > ChartFileReader.MaxAccounts)
            errors.Add(new(null, null, "每个账簿最多保留 1000 个科目。"));
        errors.AddRange(ChartRules.Validate(desired).Select(error =>
            new ChartImportIssue(imported.TryGetValue(error.Code, out var row) ? row : null, error.Code, error.Error)));
        return new(desired, changes, errors);
    }

    private static AccountDefinition Definition(ChartAccount account, IReadOnlyDictionary<Guid, string> codes) =>
        new(account.Code, account.Name, account.Category, account.ParentId is { } parent ? codes[parent] : null,
            account.Purpose, account.IsArchived);

    private static IReadOnlyList<ChartAccountView> Views(IReadOnlyList<ChartAccount> accounts)
    {
        var codes = accounts.ToDictionary(x => x.Id, x => x.Code);
        return accounts.Select(x => new ChartAccountView(x.Id, x.Code, x.Name, x.Category.ToString().ToLowerInvariant(),
            x.ParentId is { } parent ? codes[parent] : null, x.Purpose.ToString().ToLowerInvariant(), x.IsArchived, x.IsUsed, x.Version)).ToArray();
    }

    private static IReadOnlyList<AccountInput> Inputs(IReadOnlyList<ChartAccount> accounts) =>
        Views(accounts).Select(x => new AccountInput(x.Code, x.Name, x.Category, x.ParentCode, x.Purpose, x.IsArchived)).ToArray();

    private static string Hash(string value) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}
