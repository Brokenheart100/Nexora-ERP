using Nexora.Finance.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Finance.Infrastructure;

public static class ChartHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<ChartRevisionResult> Handle(SaveChartAccount command, FinanceDbContext db, ChartUseCases useCases, CancellationToken ct) =>
        useCases.SaveAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<ChartPreviewView> Handle(PreviewChartImport command, FinanceDbContext db, ChartUseCases useCases, CancellationToken ct) =>
        useCases.PreviewAsync(command, ct);

    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static Task<ChartRevisionResult> Handle(CommitChartImport command, FinanceDbContext db, ChartUseCases useCases, CancellationToken ct) =>
        useCases.CommitAsync(command, ct);
}
