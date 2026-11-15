using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class BankCutoff(IReconciliationStore store)
{
    public async Task DemandOpenAsync(ResourceScope scope, Guid bankId, DateOnly on, CancellationToken ct)
    {
        if (await store.ClosedThroughAsync(scope, bankId, ct) >= on)
            throw new LedgerRuleException("The bank account is reconciled through this date.");
    }

    public async Task DemandPostingAsync(ResourceScope scope, Guid[] accounts, DateOnly on, CancellationToken ct)
    {
        if (await store.AnyClosedAccountAsync(scope, accounts, on, ct))
            throw new LedgerRuleException("A cash account is reconciled through this posting date.");
    }
}

public sealed class BankReconciliations(TradeAccess access, ITradeStore trade, IReconciliationStore store,
    FinanceMutation mutations, TradePosting posting, TimeProvider clock)
{
    public async Task<ReconciliationView[]> ListAsync(Guid workspaceId, Guid bankId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        await BankAsync(current.Scope, bankId, ct);
        return (await store.ListAsync(current.Scope, bankId, ct)).Select(View).ToArray();
    }

    public async Task<InvoicePdf> PdfAsync(Guid workspaceId, Guid id, IReconciliationRenderer renderer, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        var reconciliation = await FindAsync(current.Scope, id, ct);
        if (reconciliation.State is not (ReconciliationState.Completed or ReconciliationState.Undone))
            throw new ResourceNotFoundException();
        var bank = await BankAsync(current.Scope, reconciliation.BankId, ct);
        return await renderer.RenderAsync(View(reconciliation), bank.Name, book.BaseCurrency, book.MinorUnits, ct);
    }

    public async Task<BankReconciliationSnapshot> PreviewAsync(Guid workspaceId, Guid bankId, DateOnly through, decimal ending, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspaceId, ct);
        Validate(book, through, ending);
        var bank = await BankAsync(current.Scope, bankId, ct);
        return await SnapshotAsync(current.Scope, bank, through, ending, ct);
    }

    public async Task<ReconciliationView> PrepareAsync(PrepareReconciliation command, CancellationToken ct)
    {
        const string action = "bank.reconciliation-prepared";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return View(await FindAsync(current.Scope, replay.TargetId!.Value, ct));
        Validate(book, command.Through, command.StatementBalance);
        var bank = await BankAsync(current.Scope, command.BankId, ct);
        if (await store.ClosedThroughAsync(current.Scope, bank.Id, ct) >= command.Through)
            throw new LedgerRuleException("The reconciliation must follow the last completed cutoff.");
        var snapshot = await SnapshotAsync(current.Scope, bank, command.Through, command.StatementBalance, ct);
        var reconciliation = new BankReconciliation(bank, command.Through, command.StatementBalance,
            JsonSerializer.Serialize(snapshot), Actor(current), clock.GetUtcNow());
        store.Add(reconciliation);
        mutations.Record(current, command.OperationId, action, command, reconciliation.Id, reconciliation.Version);
        return View(reconciliation);
    }

    public async Task<ReconciliationView> DecideAsync(DecideReconciliation command, CancellationToken ct)
    {
        var permission = command.Decision switch
        {
            "cancel" => LedgerPermissions.Draft,
            "finish" or "undo" => LedgerPermissions.Post,
            _ => throw new ArgumentException("Invalid reconciliation decision.")
        };
        var (current, book) = await access.LockAsync(command.WorkspaceId, permission, ct);
        var action = "bank.reconciliation-" + command.Decision;
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return View(await FindAsync(current.Scope, replay.TargetId!.Value, ct));
        var reconciliation = await FindAsync(current.Scope, command.Id, ct);
        if (reconciliation.Version != command.ExpectedVersion) throw new RevisionConflictException("The reconciliation version changed.");
        if (command.Decision == "cancel") reconciliation.Cancel(Actor(current));
        else
        {
            var gate = await posting.GateAsync(current.Scope, book, reconciliation.Through, ct);
            if (gate is not null) throw new LedgerRuleException(gate);
            var last = await store.ClosedThroughAsync(current.Scope, reconciliation.BankId, ct);
            if (command.Decision == "finish")
            {
                if (last >= reconciliation.Through) throw new LedgerRuleException("The reconciliation cutoff has already been completed.");
                var bank = await BankAsync(current.Scope, reconciliation.BankId, ct);
                var snapshot = await SnapshotAsync(current.Scope, bank, reconciliation.Through, reconciliation.StatementBalance, ct);
                reconciliation.Finish(Actor(current), ReadSnapshot(reconciliation), snapshot, clock.GetUtcNow());
            }
            else
            {
                if (last != reconciliation.Through) throw new LedgerRuleException("Undo the latest reconciliation for this account first.");
                reconciliation.Undo(command.Reason?.Trim() ?? "");
            }
        }
        mutations.Record(current, command.OperationId, action, command, reconciliation.Id, reconciliation.Version);
        return View(reconciliation);
    }

    private async Task<BankReconciliationSnapshot> SnapshotAsync(ResourceScope scope, BankAccount bank, DateOnly through,
        decimal ending, CancellationToken ct) => BankReconciliationSnapshot.Calculate(through, ending, await store.InputsAsync(scope, bank, through, ct));

    private async Task<BankAccount> BankAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        await trade.BankAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
    private async Task<BankReconciliation> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        await store.FindAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
    private static JournalActor Actor(BookAccess access) => new(access.Actor.Issuer, access.Actor.Subject);
    private static ReconciliationView View(BankReconciliation row) => new(row.Id, row.BankId, row.Version,
        row.State.ToString().ToLowerInvariant(), ReadSnapshot(row), row.UndoReason);
    private static BankReconciliationSnapshot ReadSnapshot(BankReconciliation row) =>
        JsonSerializer.Deserialize<BankReconciliationSnapshot>(row.Snapshot)!;
    private static void Validate(AccountingBook book, DateOnly through, decimal ending)
    {
        if (through < book.StartsOn || through.Year > 9998 || ending is < -1_000_000_000_000m or > 1_000_000_000_000m
            || Math.Round(ending, book.MinorUnits) != ending)
            throw new ArgumentException("Invalid reconciliation cutoff or ending balance.");
    }
}
