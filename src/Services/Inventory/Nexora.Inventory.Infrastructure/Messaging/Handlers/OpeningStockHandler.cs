using System.Globalization;
using Nexora.Finance.Contracts.Opening;
using Nexora.Inventory.Application;
using Wolverine.Attributes;
using Wolverine.Persistence;

namespace Nexora.Inventory.Infrastructure;

public static class OpeningStockHandler
{
    [Transactional(Mode = TransactionMiddlewareMode.Eager)]
    public static async Task<OpeningStockAcknowledgedV1> Handle(OpeningStockRequestedV1 request, InventoryDbContext db,
        InventoryUseCases service, CancellationToken ct)
    {
        var rows = request.Rows.Select(row => new OpeningStockLine(row.MovementId, row.WarehouseId, row.ItemId, row.UnitId,
            Parse(row.Quantity), Parse(row.Value))).ToArray();
        var rejected = await service.ApplyOpeningAsync(new(request.TenantId, request.WorkspaceId), request.BatchId, request.On,
            request.Currency, rows, ct);
        return new(request.BatchId, request.TenantId, request.WorkspaceId, rejected);
    }

    private static decimal Parse(string input) =>
        decimal.Parse(input, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
}
