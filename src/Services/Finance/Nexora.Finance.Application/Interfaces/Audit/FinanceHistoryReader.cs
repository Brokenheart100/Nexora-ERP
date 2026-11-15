using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public interface IFinanceHistoryReader
{
    Task<FinanceHistory> ReadAsync(ResourceScope scope, DateOnly through, long watermark, bool includeCash, CancellationToken ct);
}
