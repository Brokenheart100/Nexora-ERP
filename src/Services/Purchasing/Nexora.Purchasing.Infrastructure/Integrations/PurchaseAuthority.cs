using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Finance.Contracts.Grpc;
using Nexora.Inventory.Contracts.Grpc;
using Nexora.MasterData.Contracts.Grpc;
using Nexora.Organization.Contracts.Grpc;
using Nexora.Purchasing.Application;
using Nexora.Purchasing.Domain;

namespace Nexora.Purchasing.Infrastructure;

public sealed class PurchaseAuthority(IHttpContextAccessor accessor, IOrganizationGrpc organization, IFinanceGrpc finance,
    IMasterDataGrpc masterData, IInventoryGrpc inventory) : IPurchaseAuthority
{
    private const string ReferenceConflict = "The selected purchasing reference is inactive or ineligible.";

    public async Task<PurchaseAccess> AccessAsync(Guid workspaceId, CancellationToken ct)
    {
        var http = accessor.HttpContext;
        var issuer = http?.User.FindFirstValue("iss");
        var subject = http?.User.FindFirstValue("sub");
        if (http?.User.Identity?.IsAuthenticated != true || string.IsNullOrWhiteSpace(issuer) || issuer.Length > 500
            || string.IsNullOrWhiteSpace(subject) || subject.Length > 200)
            throw new AccessDeniedException();
        var access = await GrpcErrorMapper.CallAsync(
            () => organization.GetWorkspaceAccessAsync(new WorkspaceAccessRequest { WorkspaceId = workspaceId },
                GrpcCallContext.RequireBearer(accessor, ct)),
            ct,
            Unavailable,
            Conflict);
        if (access.WorkspaceId != workspaceId || access.TenantId == Guid.Empty || access.Permissions is null)
            throw new PurchaseAuthorityUnavailableException();
        if (access.IsPersonal || !access.Permissions.Contains("organization.workspace.read", StringComparer.Ordinal))
            throw new AccessDeniedException();
        return new(new(access.TenantId, workspaceId), new(issuer, subject), access.Permissions,
            access.ScopedPermissions.Select(grant => new ScopedPermission(grant.Permission,
                grant.DepartmentId == Guid.Empty ? null : grant.DepartmentId,
                grant.WarehouseId == Guid.Empty ? null : grant.WarehouseId)).ToArray(),
            access.DepartmentIds);
    }

    public async Task<PurchaseTerms> TermsAsync(ResourceScope scope, CancellationToken ct)
    {
        var book = await GrpcErrorMapper.CallAsync(
            () => finance.GetBookAsync(new BookRequest { WorkspaceId = scope.WorkspaceId },
                GrpcCallContext.RequireBearer(accessor, ct)),
            ct,
            Unavailable,
            Conflict);
        if (!book.HasSettings) throw new BusinessConflictException("Initialize the workspace accounting book first.");
        if (!DateOnly.TryParseExact(book.StartsOn, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var startsOn))
            throw new PurchaseAuthorityUnavailableException();
        var currency = book.BaseCurrency ?? string.Empty;
        if (currency is not ("CNY" or "USD" or "EUR" or "JPY")
            || book.MinorUnits != (currency == "JPY" ? 0 : 2) || startsOn.Year is < 1900 or > 9998)
            throw new PurchaseAuthorityUnavailableException();
        return new(currency, book.MinorUnits, startsOn);
    }

    public async Task<SupplierReference> SupplierAsync(ResourceScope scope, Guid supplierId, CancellationToken ct)
    {
        var partner = await GrpcErrorMapper.CallAsync(
            () => masterData.GetPartnerReferenceAsync(new PartnerReferenceRequest
                { WorkspaceId = scope.WorkspaceId, PartnerId = supplierId, Role = "supplier" },
                GrpcCallContext.RequireBearer(accessor, ct)),
            ct,
            Unavailable,
            Conflict);
        if (partner.Id != supplierId || partner.Version < 1 || partner.Role != "supplier")
            throw new PurchaseAuthorityUnavailableException();
        return new(partner.Id, partner.Code, partner.Name, partner.Version);
    }

    public async Task<StockReference> StockAsync(ResourceScope scope, Guid itemId, CancellationToken ct)
    {
        var stock = await GrpcErrorMapper.CallAsync(
            () => masterData.GetItemReferenceAsync(new ItemReferenceRequest
                { WorkspaceId = scope.WorkspaceId, ItemId = itemId, Inventory = true },
                GrpcCallContext.RequireBearer(accessor, ct)),
            ct,
            Unavailable,
            Conflict);
        if (stock.ItemId != itemId || stock.Version < 1 || stock.CategoryId == Guid.Empty || stock.UnitId == Guid.Empty
            || stock.CategoryVersion < 1 || stock.UnitVersion < 1)
            throw new PurchaseAuthorityUnavailableException();
        return new(stock.ItemId, stock.Code, stock.Name, stock.Version, stock.CategoryId, stock.CategoryVersion,
            stock.UnitId, stock.UnitCode, stock.UnitVersion);
    }

    public async Task DemandWarehouseAsync(ResourceScope scope, Guid warehouseId, CancellationToken ct)
    {
        var warehouse = await GrpcErrorMapper.CallAsync(
            () => inventory.GetWarehouseReferenceAsync(new WarehouseReferenceRequest
                { WorkspaceId = scope.WorkspaceId, WarehouseId = warehouseId },
                GrpcCallContext.RequireBearer(accessor, ct)),
            ct,
            Unavailable,
            Conflict);
        if (warehouse.Id != warehouseId || warehouseId == Guid.Empty) throw new PurchaseAuthorityUnavailableException();
    }

    private static Exception Unavailable(string detail) => new PurchaseAuthorityUnavailableException();

    private static Exception Conflict(string detail) => new BusinessConflictException(ReferenceConflict);
}
