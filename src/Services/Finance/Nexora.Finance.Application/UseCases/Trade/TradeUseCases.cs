using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class TradeUseCases(TradeAccess access, IChartStore chart, ILedgerStore ledger, ITradeStore store,
    ITaxStore taxes, ITradePartnerAuthority partners, FinanceMutation mutations, TradePosting posting, TimeProvider clock, IReceivableStore receivables, IInvoiceReference presentation)
{
    public async Task<TradeHome> HomeAsync(Guid workspace, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspace, ct);
        return new(book.BaseCurrency, book.MinorUnits, current.Allows(ChartPermissions.Manage), current.Allows(LedgerPermissions.Draft),
            current.Allows(LedgerPermissions.Post), await store.SetupAsync(current.Scope, ct),
            (await store.BanksAsync(current.Scope, ct)).Select(x => new BankView(x.Id, x.Code, x.Name, x.Kind, x.AccountId, x.IsDefault, x.Balance, x.Version)).ToArray());
    }

    public async Task<TradeDocumentView[]> DocumentsAsync(Guid workspace, int page, CancellationToken ct)
    {
        RequirePage(page);
        var (current, _) = await access.ReadAsync(workspace, ct);
        return (await store.DocumentsAsync(current.Scope, page, ct)).Select(x => new TradeDocumentView(x.Id, x.Terms,
            x.State.ToString().ToLowerInvariant(), x.Version, x.JournalId, x.ReversedById, x.Total, x.Outstanding, x.Recoverable,
            x.MadeBy(Actor(current)), x.BillMatches?.ToArray())).ToArray();
    }

    public async Task<AccrualView[]> ReceiptsAsync(Guid workspace, int page, CancellationToken ct)
    {
        RequirePage(page);
        var (current, _) = await access.ReadAsync(workspace, ct);
        return (await store.ReceiptsAsync(current.Scope, page, ct)).Select(x =>
            new AccrualView(x.Fact, x.Posted, x.PendingReason, x.JournalId, x.MatchedQuantity, x.MatchedCost)).ToArray();
    }

    public async Task<BankMovement[]> MovementsAsync(Guid workspace, Guid bankId, int page, CancellationToken ct)
    {
        RequirePage(page);
        var (current, _) = await access.ReadAsync(workspace, ct);
        await BankAsync(current.Scope, bankId, ct);
        return await store.MovementsAsync(current.Scope, bankId, page, ct);
    }

    public async Task<TradeChange> ConfigureAsync(ConfigureTrade command, CancellationToken ct)
    {
        const string action = "trade.configured";
        var (current, book) = await access.LockAsync(command.WorkspaceId, ChartPermissions.Manage, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Replay(replay);
        if (await store.SetupAsync(current.Scope, ct) is not null) throw new LedgerRuleException("Trading account mappings are already configured.");
        var setup = command.Accounts ?? throw new ArgumentException("Trading account mappings are required.");
        Guid[] ids = [setup.InventoryAccountId, setup.AccrualAccountId, setup.PayableAccountId, setup.InputTaxAccountId,
            setup.VarianceAccountId, setup.DonationIncomeAccountId, .. setup.SupplierRecoveryAccountId is Guid recovery ? new[] { recovery } : []];
        if (ids.Distinct().Count() != ids.Length) throw new ArgumentException("Choose distinct accounts for each posting function.");
        await DemandAccount(current.Scope, ids[0], AccountCategory.Asset, AccountPurpose.Control, ct);
        await DemandAccount(current.Scope, ids[1], AccountCategory.Liability, AccountPurpose.Control, ct);
        await DemandAccount(current.Scope, ids[2], AccountCategory.Liability, AccountPurpose.Control, ct);
        await DemandAccount(current.Scope, ids[3], AccountCategory.Asset, AccountPurpose.Posting, ct);
        await DemandAccount(current.Scope, ids[4], AccountCategory.Expense, AccountPurpose.Posting, ct);
        await DemandAccount(current.Scope, ids[5], AccountCategory.Income, AccountPurpose.Posting, ct);
        if (setup.SupplierRecoveryAccountId is Guid recoveryId)
            await DemandAccount(current.Scope, recoveryId, AccountCategory.Asset, AccountPurpose.Control, ct);
        if ((await store.BanksAsync(current.Scope, ct)).Any(bank => ids.Contains(bank.AccountId)))
            throw new LedgerRuleException("Trading mappings cannot use a bank control account.");
        foreach (var account in await ledger.AccountsAsync(current.Scope, ids, ct)) account.MarkUsed();
        book.RegisterAccountingActivity();
        book.AdvanceChart();
        store.Add(new TradeSetup(current.Scope.TenantId, current.Scope.WorkspaceId, 1, ids[0], ids[1], ids[2], ids[3], ids[4], ids[5], setup.SupplierRecoveryAccountId));
        return Record(current, command.OperationId, action, command, current.Scope.WorkspaceId, 1);
    }

    public async Task<TradeChange> OpenAsync(OpenBank command, CancellationToken ct)
    {
        const string action = "trade.bank.created";
        var (current, book) = await access.LockAsync(command.WorkspaceId, ChartPermissions.Manage, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Replay(replay);
        var chartAccount = await DemandAccount(current.Scope, command.AccountId, AccountCategory.Asset, AccountPurpose.Control, ct);
        if (chartAccount.IsUsed || (await store.SetupAsync(current.Scope, ct))?.InventoryAccountId == chartAccount.Id)
            throw new LedgerRuleException("Choose a dedicated, unused bank control account.");
        var banks = await store.BanksAsync(current.Scope, ct);
        var bank = new BankAccount(book, NormalizeNumber(command.Code, 40), command.Name?.Trim() ?? "", command.Kind, chartAccount.Id);
        if (banks.Length == 0) bank.SetDefault(true);
        store.Add(bank);
        chartAccount.MarkUsed();
        book.RegisterAccountingActivity();
        book.AdvanceChart();
        return Record(current, command.OperationId, action, command, bank.Id, bank.Version);
    }

    public async Task<TradeChange> DefaultAsync(DefaultBank command, CancellationToken ct)
    {
        const string action = "trade.bank.default";
        var (current, _) = await access.LockAsync(command.WorkspaceId, ChartPermissions.Manage, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Replay(replay);
        var banks = await store.BanksAsync(current.Scope, ct);
        var selected = banks.SingleOrDefault(x => x.Id == command.BankId) ?? throw new ResourceNotFoundException();
        if (selected.Version != command.ExpectedVersion) throw new RevisionConflictException("Bank account version changed.");
        foreach (var bank in banks) bank.SetDefault(bank == selected);
        return Record(current, command.OperationId, action, command, selected.Id, selected.Version);
    }

    public async Task<TradeChange> SubmitAsync(SubmitTrade command, CancellationToken ct)
    {
        const string action = "trade.submitted";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Replay(replay);
        if (command.Terms is null || !Enum.IsDefined(command.Terms.Kind) || command.Terms.DonationIdentity is not null) throw new ArgumentException("A financial document is required.");
        var terms = command.Terms with { Number = NormalizeNumber(command.Terms.Number, 60), Memo = command.Terms.Memo?.Trim() ?? "" };
        if (terms.StatementLineId is not null && terms.Kind is not (TradeKind.Payment or TradeKind.Income or TradeKind.Expense or TradeKind.Donation or TradeKind.SupplierRefund))
            throw new ArgumentException("This document kind cannot consume a statement line.");
        long? donorVersion = null;
        if (terms.Kind == TradeKind.Donation)
        {
            if (terms.Method is not ("cash" or "cheque" or "card" or "transfer")) throw new ArgumentException("Specify a donation payment method.");
            donorVersion = (await partners.DemandDonorAsync(command.WorkspaceId, Required(terms.PartnerId), ct)).Version;
        }
        if (terms.Kind is not (TradeKind.Bill or TradeKind.Void or TradeKind.SupplierCredit)) await BankAsync(current.Scope, Required(terms.BankId), ct);
        var document = new TradeDocument(book, terms, Actor(current), clock.GetUtcNow());
        if (donorVersion is long version) document.BindPartner(version);
        store.Add(document);
        book.RegisterAccountingActivity();
        return Record(current, command.OperationId, action, command, document.Id, document.Version);
    }

    private async Task<ChartAccount> DemandAccount(ResourceScope scope, Guid id, AccountCategory category, AccountPurpose purpose, CancellationToken ct)
    {
        var account = (await ledger.AccountsAsync(scope, [id], ct)).SingleOrDefault() ?? throw new ResourceNotFoundException();
        if (account.IsArchived || account.Category != category || account.Purpose != purpose)
            throw new LedgerRuleException("Account category or purpose is incompatible with this posting.");
        return account;
    }

    private async Task<TradeSetup> SetupAsync(ResourceScope scope, CancellationToken ct) =>
        await store.SetupAsync(scope, ct) ?? throw new LedgerRuleException("Configure trading accounts first.");
    private async Task<BankAccount> BankAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        await store.BankAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
    private async Task<TradeDocument> DocumentAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        await store.DocumentAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
    private static Guid Required(Guid? value) => value is Guid id && id != Guid.Empty ? id : throw new ArgumentException("A valid reference is required.");
    private static JournalActor Actor(BookAccess access) => new(access.Actor.Issuer, access.Actor.Subject);
    private static TradeChange Replay(FinanceAudit audit) => new(audit.TargetId!.Value, audit.ResultVersion);
    private TradeChange Record(BookAccess current, Guid operation, string action, object input, Guid id, long version)
    {
        mutations.Record(current, operation, action, input, id, version);
        return new(id, version);
    }
    private static void RequirePage(int page)
    {
        if (page is < 1 or > 100_000) throw new ArgumentException("Invalid page.");
    }
    private static string NormalizeNumber(string? value, int maximum)
    {
        var number = value?.Trim().ToUpperInvariant() ?? "";
        if (number.Length < 1 || number.Length > maximum || number.Any(x => !char.IsAsciiLetterOrDigit(x) && x is not ('-' or '_' or '/' or '.')))
            throw new ArgumentException("Invalid document or account number.");
        return number;
    }
}
