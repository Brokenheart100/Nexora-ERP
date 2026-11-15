using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Finance.Application;
using Nexora.MasterData.Contracts.Grpc;

namespace Nexora.Finance.Infrastructure;

public sealed class TradePartnerAuthority(IHttpContextAccessor accessor, IMasterDataGrpc masterData) : ITradePartnerAuthority
{
    public async Task<DonorReference> DemandDonorAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        if (!AuthenticationHeaderValue.TryParse(accessor.HttpContext?.Request.Headers.Authorization.ToString(), out var token)
            || !token.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase)) throw new AccessDeniedException();
        var reference = await GrpcErrorMapper.CallAsync(
            () => masterData.GetPartnerReferenceAsync(
                new PartnerReferenceRequest { WorkspaceId = workspaceId, PartnerId = id, Role = "donor" },
                GrpcCallContext.Forward(accessor, ct)),
            ct,
            _ => new BookAuthorityUnavailableException(),
            _ => new BusinessConflictException("The donor is inactive or ineligible."));
        if (reference.Id != id || reference.Version <= 0 || reference.Role != "donor" || string.IsNullOrWhiteSpace(reference.Name))
            throw new BookAuthorityUnavailableException();
        return new(reference.Name, reference.Version);
    }
}
