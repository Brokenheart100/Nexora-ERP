using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.VisualBasic.FileIO;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class LedgerUseCases
{
    public async Task<OpeningBalancePreview> PreviewOpeningAsync(Guid workspaceId, DateOnly on, string file, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        current.DemandOn(LedgerPermissions.Draft, on);
        var book = await books.FindAsync(current.Scope, ct) ?? throw new ResourceNotFoundException();
        if (on != book.StartsOn) throw new ArgumentException("The opening date must match the start of the accounting book.");
        await DemandOpenAsync(current.Scope, book, on, ct);
        return await ReadOpeningFileAsync(current.Scope, book, file, ct);
    }

    public async Task<LedgerChange> ImportOpeningAsync(ImportOpeningBalances command, CancellationToken ct)
    {
        const string action = "journal.opening-imported";
        var (current, book) = await BeginAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        current.DemandOn(LedgerPermissions.Draft, command.On);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Change(replay);
        if (command.On != book.StartsOn) throw new ArgumentException("The opening date must match the start of the accounting book.");
        if (book.ChartRevision != command.ChartRevision)
            throw new RevisionConflictException("The chart changed. Preview opening balances again.");
        if (await store.SourceAsync(current.Scope, "opening", ct) is not null || await store.HasPostingsAsync(current.Scope, ct))
            throw new LedgerRuleException("Opening balances must be posted before other journals and may only be imported once.");
        await DemandOpenAsync(current.Scope, book, command.On, ct);
        var preview = await ReadOpeningFileAsync(current.Scope, book, command.File, ct);
        if (preview.Errors.Length > 0 || !StringComparer.Ordinal.Equals(preview.FileHash, command.FileHash))
            throw new ArgumentException("Preview the valid opening balance file before submitting it.");

        var lines = preview.Rows.Select(row => new JournalLineSnapshot(row.AccountId, row.Code, row.Name, row.Debit, row.Credit)).ToArray();
        var journal = Journal.ImportOpening(book, preview.FileHash, command.On, command.Memo, Actor(current), lines, clock.GetUtcNow());
        store.Add(journal);
        book.RegisterAccountingActivity();
        return Record(current, command.OperationId, action, command, journal);
    }

    private async Task<OpeningBalancePreview> ReadOpeningFileAsync(ResourceScope scope, AccountingBook book, string? file, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(file) || file.Length > ChartFileReader.MaxFileLength)
            throw new ArgumentException("请提供不超过 256 Ki 字符的期初余额 CSV。");
        var accounts = (await chart.ListAsync(scope, false, ct)).ToDictionary(x => x.Code, StringComparer.OrdinalIgnoreCase);
        var known = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var rows = new List<OpeningBalanceRow>();
        var errors = new List<OpeningBalanceIssue>();
        try
        {
            using var parser = new TextFieldParser(new StringReader(file.TrimStart('\uFEFF'))) { TrimWhiteSpace = true };
            parser.SetDelimiters(",");
            if (parser.ReadFields() is not { Length: 3 } headers
                || !headers.SequenceEqual(new[] { "Code", "Debit", "Credit" }, StringComparer.OrdinalIgnoreCase))
                throw new ArgumentException("CSV 表头应为 Code,Debit,Credit。");
            for (var count = 0; !parser.EndOfData; count++)
            {
                if (count == 200) throw new ArgumentException("单份期初余额文件最多 200 行。");
                var row = parser.LineNumber;
                var values = parser.ReadFields() ?? [];
                if (values is not [var code, var debit, var credit])
                {
                    errors.Add(new(row, "CSV 需要科目编码、借方、贷方三列。"));
                    continue;
                }
                if (!known.Add(code) || !accounts.TryGetValue(code, out var account) || account.IsArchived
                    || account.Purpose != AccountPurpose.Posting || account.Category is AccountCategory.Income or AccountCategory.Expense)
                {
                    errors.Add(new(row, $"科目 {code} 重复或不能用于总账期初。"));
                    continue;
                }
                if (!TryOpeningAmount(debit, book.MinorUnits, out var debitValue) || !TryOpeningAmount(credit, book.MinorUnits, out var creditValue)
                    || (debitValue > 0) == (creditValue > 0))
                {
                    errors.Add(new(row, "借方或贷方须且只能有一侧为正数，并符合本位币精度。"));
                    continue;
                }
                rows.Add(new(row, account.Id, account.Code, account.Name, debitValue, creditValue));
            }
        }
        catch (MalformedLineException error)
        {
            errors.Add(new(error.LineNumber, "CSV 引号或分隔符无效。"));
        }
        var totalDebit = rows.Sum(x => x.Debit);
        var totalCredit = rows.Sum(x => x.Credit);
        if (rows.Count < 2 || totalDebit != totalCredit)
            errors.Add(new(null, "至少需要两条有效期初余额，且借贷合计必须相等。"));
        return new(book.ChartRevision, Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(file))), book.BaseCurrency,
            totalDebit, totalCredit, rows.ToArray(), errors.ToArray());
    }

    private static bool TryOpeningAmount(string value, int minorUnits, out decimal amount)
    {
        amount = 0;
        return value.Length == 0 || (decimal.TryParse(value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount)
            && amount is >= 0 and <= 1_000_000_000_000m && Math.Round(amount, minorUnits) == amount);
    }
}
