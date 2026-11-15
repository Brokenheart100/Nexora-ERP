using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Finance.Application;
using Nexora.MasterData.Contracts.Grpc;

namespace Nexora.Finance.Infrastructure;

public sealed class MasterDataTaxReference(IHttpContextAccessor accessor, IMasterDataGrpc masterData) : ITaxReferenceAuthority
{
    public async Task<long> DemandActiveAsync(Guid workspaceId, string kind, Guid id, CancellationToken ct)
    {
        if (id == Guid.Empty) throw new ArgumentException("A valid master data reference is required.");
        if (!AuthenticationHeaderValue.TryParse(accessor.HttpContext?.Request.Headers.Authorization.ToString(), out _))
            throw new AccessDeniedException();
        if (kind == "item")
        {
            var item = await GrpcErrorMapper.CallAsync(
                () => masterData.GetItemReferenceAsync(
                    new ItemReferenceRequest { WorkspaceId = workspaceId, ItemId = id, Inventory = false },
                    GrpcCallContext.Forward(accessor, ct)),
                ct,
                _ => new BookAuthorityUnavailableException(),
                _ => new BusinessConflictException("The master data reference is inactive."));
            if (item.ItemId != id || item.Version <= 0) throw new BookAuthorityUnavailableException();
            if (!item.IsActive) throw new BusinessConflictException("The master data reference is inactive.");
            return item.Version;
        }

        var partner = await GrpcErrorMapper.CallAsync(
            () => masterData.GetPartnerProfileAsync(
                new PartnerProfileRequest { WorkspaceId = workspaceId, PartnerId = id },
                GrpcCallContext.Forward(accessor, ct)),
            ct,
            _ => new BookAuthorityUnavailableException(),
            _ => new BusinessConflictException("The master data reference is inactive."));
        if (partner.Id != id || partner.Version <= 0) throw new BookAuthorityUnavailableException();
        if (!partner.IsActive) throw new BusinessConflictException("The master data reference is inactive.");
        return partner.Version;
    }
}
