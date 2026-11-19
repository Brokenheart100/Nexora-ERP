using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class ReceivableUseCases(TradeAccess access, ITradeStore trade, IReceivableStore receivables, ITaxStore taxes,
    ILedgerStore ledger, IInvoiceReference references, FinanceMutation mutations, TradePosting posting, TimeProvider clock)
{
    public async Task<ReceivableHome> HomeAsync(Guid workspace, CancellationToken ct)
    {
        var (current, book) = await access.ReadAsync(workspace, ct);
        var setup = await receivables.SetupAsync(current.Scope, ct);
        return new(setup?.Accounts, current.Allows(ChartPermissions.Manage), current.Allows(LedgerPermissions.Draft),
            current.Allows(LedgerPermissions.Post), book.BaseCurrency, book.InvoiceNumberPattern is not null);
    }

    public async Task<CustomerDocumentView[]> ListAsync(Guid workspace, int page, CancellationToken ct, bool postedInvoicesOnly = false)
    {
        RequirePage(page);
        var (current, _) = await access.ReadAsync(workspace, ct);
        return (await receivables.ListAsync(current.Scope, page, ct, postedInvoicesOnly)).Select(x => View(x, current)).ToArray();
    }

    public async Task<CustomerDocumentView> DetailAsync(Guid workspace, Guid id, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspace, ct);
        var document = await receivables.FindAsync(current.Scope, id, ct) ?? throw new ResourceNotFoundException();
        return View(document, current);
    }

    public async Task<ShipmentAllowance[]> ShipmentsAsync(Guid workspace, int page, CancellationToken ct)
    {
        RequirePage(page);
        var (current, _) = await access.ReadAsync(workspace, ct);
        return (await receivables.ShipmentsAsync(current.Scope, page, ct)).Select(x =>
        {
            var sale = x.Fact.Sale!;
            return new ShipmentAllowance(x.Id, x.Fact.OrderId, x.ItemId, sale.CustomerId, sale.CustomerName, sale.ItemName,
                x.Fact.On, Math.Abs(x.Fact.Quantity), sale.UnitPrice, x.AvailableToInvoice, x.Fact.ReversesId,
                x.Fact.ReversesId is not null && x.Posted ? x.Fact.Quantity - x.CreditedQuantity : 0, x.Posted, x.PendingReason);
        }).ToArray();
    }

    public async Task<TradeChange> ConfigureAsync(ConfigureReceivables command, CancellationToken ct)
    {
        const string action = "receivables.configured";
        var (current, _) = await access.LockAsync(command.WorkspaceId, ChartPermissions.Manage, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Result(replay);
        if (await receivables.SetupAsync(current.Scope, ct) is not null)
            throw new LedgerRuleException("Receivable accounts have already been configured.");
        var a = command.Accounts ?? throw new ArgumentException("Choose receivable accounts.");
        var ids = new[] { a.ReceivableAccountId, a.AdvanceAccountId, a.RevenueAccountId, a.OutputTaxAccountId, a.CostOfGoodsAccountId };
        var accounts = (await ledger.AccountsAsync(current.Scope, ids, ct)).ToDictionary(x => x.Id);
        if (ids.Distinct().Count() != ids.Length || accounts.Count != ids.Length
            || !Account(ids[0], AccountCategory.Asset, AccountPurpose.Control)
            || !Account(ids[1], AccountCategory.Liability, AccountPurpose.Control)
            || !Account(ids[2], AccountCategory.Income, AccountPurpose.Posting)
            || !Account(ids[3], AccountCategory.Liability, AccountPurpose.Control)
            || !Account(ids[4], AccountCategory.Expense, AccountPurpose.Posting))
            throw new LedgerRuleException("Choose distinct active receivable, advances, revenue, output tax and cost accounts.");
        receivables.Add(new ReceivableSetup(current.Scope.TenantId, current.Scope.WorkspaceId, a));
        return Record(current, command.OperationId, action, command, current.Scope.WorkspaceId, 1);

        bool Account(Guid id, AccountCategory category, AccountPurpose purpose) =>
            accounts.TryGetValue(id, out var account) && !account.IsArchived && account.Category == category && account.Purpose == purpose;
    }

    public async Task<TradeChange> SubmitAsync(SubmitCustomerDocument command, CancellationToken ct)
    {
        const string action = "receivables.submitted";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Result(replay);
        await SetupAsync(current.Scope, ct);
        var draft = command.Draft ?? throw new ArgumentException("A customer document is required.");
        var fiscal = draft.Kind == "invoice" && string.IsNullOrWhiteSpace(draft.Number) && book.InvoiceNumberPattern is not null;
        var number = fiscal ? "" : NormalizeNumber(draft.Number);
        var terms = draft.Kind switch
        {
            "invoice" => await InvoiceAsync(current.Scope, book, draft, number, ct),
            "receipt" => await ReceiptAsync(current.Scope, book, draft, number, ct),
            "allocation" => await SettlementAsync(current.Scope, book, draft, number, false, ct),
            "refund" => await SettlementAsync(current.Scope, book, draft, number, true, ct),
            "credit" => await CreditAsync(current.Scope, book, draft, number, ct),
            _ => throw new ArgumentException("Unknown customer document type.")
        };
        var doc = new CustomerDocument(book, terms, Actor(current), clock.GetUtcNow(), fiscal);
        receivables.Add(doc);
        return Record(current, command.OperationId, action, command, doc.Id, doc.Version);
    }

    public async Task<TradeChange> ReviseAsync(ReviseCustomerInvoice command, CancellationToken ct)
    {
        const string action = "receivables.invoice-revised";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Result(replay);
        var doc = await FindAsync(current.Scope, command.Id, ct);
        if (doc.Version != command.ExpectedVersion || doc.State != CustomerDocumentState.Submitted
            || doc.Terms.Kind != CustomerDocumentKind.Invoice || doc.Terms.Lines!.Any(x => x.ShipmentId is null)
            || !doc.MadeBy(Actor(current))) throw new LedgerRuleException("This invoice cannot be revised.");
        await ReleaseInvoiceAsync(current.Scope, doc, ct);
        var terms = await InvoiceAsync(current.Scope, book, command.Draft, doc.Number, ct);
        doc.ReviseInvoice(terms, Actor(current), book);
        return Record(current, command.OperationId, action, command, doc.Id, doc.Version);
    }

    public async Task<TradeChange> DecideAsync(DecideCustomerDocument command, CancellationToken ct)
    {
        var action = command.Approve ? "receivables.posted" : "receivables.cancelled";
        var (current, book) = await access.LockAsync(command.WorkspaceId,
            command.Approve ? LedgerPermissions.Post : LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Result(replay);
        var doc = await FindAsync(current.Scope, command.Id, ct);
        if (doc.Version != command.ExpectedVersion) throw new RevisionConflictException("The customer document changed.");
        var actor = Actor(current);
        if (command.Approve)
        {
            doc.DemandIndependent(actor);
            book.DemandTaxDateOpen(doc.Terms.On);
            var gate = await posting.GateAsync(current.Scope, book, doc.Terms.On, ct);
            if (gate is not null) throw new LedgerRuleException(gate);
            if (doc.UsesFiscalNumber)
            {
                var next = await NextNumberAsync(current.Scope, book, doc.Terms.On, ct);
                if (!StringComparer.Ordinal.Equals(next.Number, command.ExpectedNumber))
                    throw new LedgerRuleException("Preview and confirm the current invoice number.", "finance.invoice_number_changed");
                doc.AssignFiscalNumber(next.Number, next.FiscalYear, next.Sequence);
            }
            await PostAsync(current.Scope, book, doc, actor, ct);
        }
        else
        {
            doc.Cancel(actor);
            if (doc.Terms.Kind == CustomerDocumentKind.Invoice) await ReleaseInvoiceAsync(current.Scope, doc, ct);
        }
        return Record(current, command.OperationId, action, command, doc.Id, doc.Version);
    }

    private async Task<ReceiptAccrual> ShipmentAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        (await trade.ReceiptAsync(scope, id, ct)) is { Posted: true, IsSales: true } shipment
            ? shipment : throw new LedgerRuleException("The shipment or return has no posted stock cost.");

    private async Task<CustomerDocument> InvoiceDocumentAsync(ResourceScope scope, Guid? id, CancellationToken ct)
    {
        var doc = await FindAsync(scope, Required(id), ct);
        return doc.Terms.Kind == CustomerDocumentKind.Invoice && doc.State == CustomerDocumentState.Posted
            ? doc : throw new LedgerRuleException("A posted customer invoice is required.");
    }

    private async Task<CustomerDocument> FundsAsync(ResourceScope scope, Guid? id, CancellationToken ct)
    {
        var doc = await FindAsync(scope, Required(id), ct);
        return doc.Terms.Kind is CustomerDocumentKind.Receipt or CustomerDocumentKind.Credit && doc.State == CustomerDocumentState.Posted
            ? doc : throw new LedgerRuleException("Posted customer funds are required.");
    }

    private async Task<BankAccount> BankAsync(ResourceScope scope, Guid? id, CancellationToken ct) =>
        await trade.BankAsync(scope, Required(id), ct) ?? throw new ResourceNotFoundException();

    private async Task<CustomerDocument> FindAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        await receivables.FindAsync(scope, id, ct) ?? throw new ResourceNotFoundException();

    private async Task<ReceivableAccounts> SetupAsync(ResourceScope scope, CancellationToken ct) =>
        (await receivables.SetupAsync(scope, ct))?.Accounts ?? throw new LedgerRuleException("Configure customer posting accounts.");

    private static void DemandBalance(CustomerDocument doc, DateOnly on, decimal amount)
    {
        if (on < doc.Terms.On || amount <= 0 || amount > doc.OpenBalance)
            throw new LedgerRuleException("Date or amount exceeds the available document balance.");
    }

    private static decimal Allocate(decimal amount, decimal full, decimal partial, int minorUnits) =>
        Math.Round(amount * partial / full, minorUnits, MidpointRounding.AwayFromZero);
    private static Guid Required(Guid? id) => id is Guid value && value != Guid.Empty ? value : throw new ArgumentException("A reference is required.");
    private static JournalActor Actor(BookAccess current) => new(current.Actor.Issuer, current.Actor.Subject);
    private static CustomerDocumentView View(CustomerDocument x, BookAccess current) => new(x.Id, x.Terms with
        { Brand = x.Terms.Brand is { } brand ? brand with { LogoPngBase64 = null } : null,
            Number = x.UsesFiscalNumber && x.NumberSequence is null ? "" : x.Number },
        x.State.ToString().ToLowerInvariant(), x.Version, x.JournalId, x.OpenBalance, x.MadeBy(Actor(current)),
        x.UsesFiscalNumber && x.NumberSequence is null && x.State == CustomerDocumentState.Submitted);
    private static TradeChange Result(FinanceAudit audit) => new(audit.TargetId!.Value, audit.ResultVersion);
    private TradeChange Record(BookAccess current, Guid operation, string action, object input, Guid id, long version)
    {
        mutations.Record(current, operation, action, input, id, version);
        return new(id, version);
    }

    private static void RequirePage(int page)
    {
        if (page is < 1 or > 100_000) throw new ArgumentException("Invalid page.");
    }

    private static string NormalizeNumber(string? input)
    {
        var number = input?.Trim().ToUpperInvariant() ?? "";
        if (number.Length is < 1 or > 60 || number.Any(x => !char.IsAsciiLetterOrDigit(x) && x is not ('-' or '_' or '/')))
            throw new ArgumentException("Use a valid customer document number.");
        return number;
    }
}
