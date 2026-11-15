using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Infrastructure;

public sealed class CatalogRepository(CatalogDbContext db) : ICatalogRepository
{
    public Task<CatalogReceipt?> FindReceiptAsync(CatalogAccess access, Guid operationId, CancellationToken ct) =>
        db.Receipts.AsNoTracking().SingleOrDefaultAsync(x => x.TenantId == access.Scope.TenantId
            && x.WorkspaceId == access.Scope.WorkspaceId && x.Issuer == access.Actor.Issuer
            && x.Subject == access.Actor.Subject && x.OperationId == operationId, ct);

    public Task<CatalogDefinition?> FindDefinitionForUpdateAsync(ResourceScope scope, Guid id, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null)
            throw new InvalidOperationException("Catalog definition writes require an active transaction.");
        return db.Definitions.FromSqlInterpolated($"""
            SELECT * FROM masterdata.definitions
            WHERE "TenantId" = {scope.TenantId} AND "WorkspaceId" = {scope.WorkspaceId} AND "Id" = {id}
            FOR UPDATE
            """).SingleOrDefaultAsync(ct);
    }

    public Task<CatalogItem?> FindItemAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        db.Items.SingleOrDefaultAsync(x => x.TenantId == scope.TenantId && x.WorkspaceId == scope.WorkspaceId && x.Id == id, ct);

    public void Add(CatalogDefinition definition) => db.Definitions.Add(definition);
    public void Add(CatalogItem item) => db.Items.Add(item);
    public void Add(CatalogReceipt receipt) => db.Receipts.Add(receipt);
}
