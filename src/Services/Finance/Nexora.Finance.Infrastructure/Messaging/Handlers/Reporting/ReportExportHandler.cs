using Nexora.Finance.Application;
using Npgsql;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class ReportExportHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(ReportExportView, BuildReportExport?)> Handle(QueueReportExport command, FinanceDbContext db,
        ReportExports exports, CancellationToken ct) => exports.QueueAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<(ReportExportView, BuildReportExport?)> Handle(RebuildReportExport command, FinanceDbContext db,
        ReportExports exports, CancellationToken ct) => exports.RebuildAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    [ScheduleRetry(typeof(NpgsqlException), 2, 10, 30)]
    public static Task Handle(BuildReportExport command, FinanceDbContext db, ReportExports exports, CancellationToken ct) =>
        exports.BuildAsync(command, ct);
}
