using System.Globalization;
using System.Diagnostics.Metrics;
using System.Text;
using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class ReportExports(TradeAccess access, FinancialReports reports, IReportExportStore store,
    IChartStore chart, FinanceMutation mutations, TimeProvider clock)
{
    private const int PendingLimit = 3;
    private const int RetainedLimit = 20;
    public const string MeterName = "Nexora.Finance.Reporting";
    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> CapacityRejections = Meter.CreateCounter<long>("nexora.finance.report_export.capacity_rejections");

    public async Task<ReportExportView[]> ListAsync(Guid workspaceId, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        return await store.ListAsync(current.Scope, Actor(current), ct);
    }

    public async Task<ReportExportFile> FileAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        var job = await FindForActorAsync(current, id, ct);
        if (job.File is null) throw new BusinessConflictException("The export is still queued.");
        return new($"{job.Kind}-{job.Watermark}.csv", job.File);
    }

    public async Task<ReportExportView> DetailAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var (current, _) = await access.ReadAsync(workspaceId, ct);
        return View(await FindForActorAsync(current, id, ct));
    }

    public async Task<(ReportExportView, BuildReportExport?)> QueueAsync(QueueReportExport command, CancellationToken ct)
    {
        const string action = "report.export.queued";
        var (current, book) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Read, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return (View(await FindForActorAsync(current, replay.TargetId!.Value, ct)), null);
        await DemandCapacityAsync(current, ct);
        var report = await reports.ReadScopedAsync(current.Scope, book, command.Kind, command.From, command.Through,
            command.Compare, command.Watermark, command.Basis, ct);
        return await AddAsync(current, command.OperationId, action, command, report.Kind, report.Watermark,
            JsonSerializer.Serialize(report), ct);
    }

    public async Task<(ReportExportView, BuildReportExport?)> RebuildAsync(RebuildReportExport command, CancellationToken ct)
    {
        const string action = "report.export.rebuilt";
        var (current, _) = await access.LockAsync(command.WorkspaceId, LedgerPermissions.Read, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return (View(await FindForActorAsync(current, replay.TargetId!.Value, ct)), null);
        await DemandCapacityAsync(current, ct);
        var original = await FindForActorAsync(current, command.Id, ct);
        return await AddAsync(current, command.OperationId, action, command, original.Kind, original.Watermark,
            original.Snapshot, ct);
    }

    public async Task BuildAsync(BuildReportExport command, CancellationToken ct)
    {
        var scope = new ResourceScope(command.TenantId, command.WorkspaceId);
        if (await chart.LockBookAsync(scope, ct) is null) return;
        var job = await store.FindAsync(scope, command.Id, ct);
        if (job is null || job.CompletedAtUtc is not null) return;
        var report = JsonSerializer.Deserialize<FinancialReport>(job.Snapshot)
            ?? throw new InvalidOperationException("Invalid report export snapshot.");
        job.Complete(Csv(report), clock.GetUtcNow());
    }

    private async Task DemandCapacityAsync(BookAccess current, CancellationToken ct)
    {
        if (await store.CountPendingAsync(current.Scope, Actor(current), ct) >= PendingLimit)
        {
            CapacityRejections.Add(1);
            throw new BusinessConflictException("Too many report exports are still queued. Wait for one to finish, then retry.");
        }
    }

    private async Task<(ReportExportView, BuildReportExport)> AddAsync(BookAccess current, Guid operationId, string action,
        object command, string kind, long watermark, string snapshot, CancellationToken ct)
    {
        var job = new ReportExport(current.Scope.TenantId, current.Scope.WorkspaceId, Actor(current),
            kind, watermark, snapshot, clock.GetUtcNow());
        store.Add(job);
        mutations.Record(current, operationId, action, command, job.Id, 1);
        await store.PruneAsync(current.Scope, Actor(current), RetainedLimit - 1, ct);
        return (View(job), new(job.TenantId, job.WorkspaceId, job.Id));
    }

    private async Task<ReportExport> FindForActorAsync(BookAccess current, Guid id, CancellationToken ct)
    {
        var job = await store.FindAsync(current.Scope, id, ct);
        if (job is null || job.Issuer != current.Actor.Issuer || job.Subject != current.Actor.Subject)
            throw new ResourceNotFoundException();
        return job;
    }

    private static JournalActor Actor(BookAccess current) => new(current.Actor.Issuer, current.Actor.Subject);
    private static ReportExportView View(ReportExport job) => new(job.Id, job.Kind, job.Watermark, job.RequestedAtUtc, job.CompletedAtUtc);

    private static byte[] Csv(FinancialReport report)
    {
        var csv = new StringBuilder("\uFEFF");
        Row("报表", "口径", "本期起日", "本期止日", "上期起日", "上期止日", "币种", "过账水位");
        Row(report.Kind, report.Basis, Date(report.Period.From), Date(report.Period.Through),
            Date(report.PreviousPeriod?.From), Date(report.PreviousPeriod?.Through), report.Currency, report.Watermark.ToString(CultureInfo.InvariantCulture));
        Row("类型", "代码", "名称", "期初", "借方", "贷方", "本期", "上期", "变动");
        foreach (var line in report.Lines)
            Row(line.Row.Section, Text(line.Row.Code), Text(line.Row.Name), Number(line.Row.Opening), Number(line.Row.Debit),
                Number(line.Row.Credit), Number(line.Row.Amount), Number(line.Previous), Number(line.Difference));
        foreach (var total in report.Totals)
            Row("合计", "", total.Key, "", "", "", Number(total.Amount), Number(total.Previous), Number(total.Difference));
        return Encoding.UTF8.GetBytes(csv.ToString());

        void Row(params string[] cells) => csv.AppendJoin(',', cells.Select(x => "\"" + x.Replace("\"", "\"\"") + "\"")).Append("\r\n");
        string Number(decimal? value) => value?.ToString($"F{report.MinorUnits}", CultureInfo.InvariantCulture) ?? "";
        static string Date(DateOnly? value) => value?.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) ?? "";
        static string Text(string value) => value.TrimStart() is ['=' or '+' or '-' or '@', ..] || value is ['\t' or '\r' or '\n', ..]
            ? "'" + value : value;
    }
}
