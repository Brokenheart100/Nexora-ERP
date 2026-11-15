using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IFinancialReportReader
{
    Task<StatementAccount[]> TotalsAsync(ResourceScope scope, StatementPeriod period, long watermark, CancellationToken ct, bool excludeClosing = false);
    Task<ReportPosting[]> PostingsAsync(ResourceScope scope, StatementPeriod period, long watermark, Guid? accountId, int page, CancellationToken ct, bool excludeClosing = false);
}
