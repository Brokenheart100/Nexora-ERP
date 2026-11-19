using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class OpeningSubledgers
{
    private async Task<OpeningSubledgerPreview> ReadFileAsync(ResourceScope scope, AccountingBook book, Guid equityAccountId, string file,
        CancellationToken ct)
    {
        var (hash, input, errors) = OpeningSubledgerFile.Read(file, book.MinorUnits);
        if (errors.Length != 0) return new(hash, book.ChartRevision, book.StartsOn, book.BaseCurrency, [], errors);
        var kinds = input.Select(row => row.Kind).ToHashSet();
        if (kinds.Contains(OpeningSubledgerKind.Stock)) await references.DemandWarehouseManagementAsync(scope.WorkspaceId, ct);
        var tradeSetup = kinds.Contains(OpeningSubledgerKind.Stock) || kinds.Contains(OpeningSubledgerKind.Payable)
            ? await trade.SetupAsync(scope, ct) ?? throw new BusinessConflictException("Configure trade accounts first.") : null;
        var customerSetup = kinds.Contains(OpeningSubledgerKind.Receivable)
            ? await receivables.SetupAsync(scope, ct) ?? throw new BusinessConflictException("Configure receivable accounts first.") : null;
        var rows = new List<OpeningSubledgerRow>();
        var issues = new List<OpeningBalanceIssue>();
        foreach (var row in input)
        {
            try
            {
                var data = row.Kind switch
                {
                    OpeningSubledgerKind.Stock => await StockAsync(scope.WorkspaceId, row.Resource, row.Warehouse!.Value, tradeSetup!.InventoryAccountId, ct),
                    OpeningSubledgerKind.Receivable => (await references.PartnerAsync(scope.WorkspaceId, row.Resource, "customer", ct),
                        (Guid?)null, customerSetup!.Accounts.ReceivableAccountId),
                    OpeningSubledgerKind.Payable => (await references.PartnerAsync(scope.WorkspaceId, row.Resource, "supplier", ct),
                        (Guid?)null, tradeSetup!.PayableAccountId),
                    _ => await BankAsync(scope, row.Resource, ct)
                };
                rows.Add(new(Guid.CreateVersion7(), row.Kind, row.Reference, row.Resource, row.Warehouse, data.Item2,
                    data.Item1, row.Quantity, row.Amount, row.DueOn, data.Item3));
            }
            catch (ResourceNotFoundException) { issues.Add(new(row.Line, "当前工作区找不到该资源。")); }
            catch (BusinessConflictException error) { issues.Add(new(row.Line, error.Message)); }
        }
        if (issues.Count == 0) await DemandAccountsAsync(scope, equityAccountId, rows, ct);
        return new(hash, book.ChartRevision, book.StartsOn, book.BaseCurrency, rows.ToArray(), issues.ToArray());
    }

    private async Task<(string, Guid?, Guid)> StockAsync(Guid workspaceId, Guid id, Guid warehouseId, Guid accountId, CancellationToken ct)
    {
        await references.DemandWarehouseAsync(workspaceId, warehouseId, ct);
        var (unit, name) = await references.ItemAsync(workspaceId, id, ct);
        return (name, unit, accountId);
    }

    private async Task<(string, Guid?, Guid)> BankAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        var bank = await trade.BankAsync(scope, id, ct) ?? throw new ResourceNotFoundException();
        if (bank.Entries != 0) throw new BusinessConflictException("资金账户已有流水，无法导入期初。");
        return (bank.Name, null, bank.AccountId);
    }

    private async Task DemandAccountsAsync(ResourceScope scope, Guid equity, IReadOnlyList<OpeningSubledgerRow> rows, CancellationToken ct)
    {
        if (rows.GroupBy(x => x.AccountId).Any(group => group.Select(x => x.Kind).Distinct().Count() > 1))
            throw new BusinessConflictException("不同类别的期初子账必须使用独立的统驭科目。");
        var ids = rows.Select(x => x.AccountId).Append(equity).Distinct().ToArray();
        var accounts = (await ledger.AccountsAsync(scope, ids, ct)).ToDictionary(x => x.Id);
        if (!accounts.TryGetValue(equity, out var offset) || offset.IsArchived || offset.Category != AccountCategory.Equity
            || offset.Purpose != AccountPurpose.Posting)
            throw new ArgumentException("请选择有效的权益记账科目作为期初对方科目。");
        foreach (var row in rows)
        {
            var category = row.Kind == OpeningSubledgerKind.Payable ? AccountCategory.Liability : AccountCategory.Asset;
            if (!accounts.TryGetValue(row.AccountId, out var control) || control.IsArchived
                || control.Purpose != AccountPurpose.Control || control.Category != category)
                throw new BusinessConflictException("期初统驭科目已停用或不符合子账类别。");
        }
    }

    private async Task DemandReferencesAsync(ResourceScope scope, OpeningSubledgerRow[] rows, CancellationToken ct)
    {
        foreach (var row in rows)
        {
            switch (row.Kind)
            {
                case OpeningSubledgerKind.Stock:
                    await references.DemandWarehouseAsync(scope.WorkspaceId, row.WarehouseId!.Value, ct);
                    var (unit, _) = await references.ItemAsync(scope.WorkspaceId, row.ResourceId, ct);
                    if (unit != row.UnitId) throw new BusinessConflictException("库存单位已变化，请重新导入。");
                    break;
                case OpeningSubledgerKind.Bank:
                    var (_, _, account) = await BankAsync(scope, row.ResourceId, ct);
                    if (account != row.AccountId) throw new BusinessConflictException("资金账户已变化，请重新导入。");
                    break;
                default:
                    await references.PartnerAsync(scope.WorkspaceId, row.ResourceId,
                        row.Kind == OpeningSubledgerKind.Receivable ? "customer" : "supplier", ct);
                    break;
            }
        }
    }
}
