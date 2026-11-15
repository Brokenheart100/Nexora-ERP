using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;
using Nexora.BuildingBlocks.Application;
using Nexora.BuildingBlocks.Grpc;
using Nexora.Finance.Application;
using Nexora.Finance.Domain;
using Nexora.MasterData.Contracts.Grpc;
using Nexora.Organization.Contracts.Grpc;

namespace Nexora.Finance.Infrastructure;

public sealed class InvoiceReference(IHttpContextAccessor accessor, IOrganizationGrpc organization, IMasterDataGrpc masterData) : IInvoiceReference
{
    public async Task<InvoiceBrand> BrandAsync(Guid workspaceId, CancellationToken ct)
    {
        DemandBearer();
        var settings = await GrpcErrorMapper.CallAsync(
            () => organization.GetCompanySettingsAsync(new CompanySettingsRequest { WorkspaceId = workspaceId },
                GrpcCallContext.Forward(accessor, ct)),
            ct,
            _ => new BookAuthorityUnavailableException(),
            _ => new BusinessConflictException("The invoice reference is inactive."));
        if (settings.WorkspaceId != workspaceId) throw new BookAuthorityUnavailableException();
        const string png = "data:image/png;base64,";
        return new(settings.LegalName, settings.BrandName, settings.AccentColor,
            settings.LogoDataUrl?.StartsWith(png, StringComparison.Ordinal) == true ? settings.LogoDataUrl[png.Length..] : null,
            settings.Version, settings.DateFormat, settings.TimeZone);
    }

    public async Task<InvoiceCustomer> CustomerAsync(Guid workspaceId, Guid customerId, CancellationToken ct)
    {
        DemandBearer();
        var partner = await GrpcErrorMapper.CallAsync(
            () => masterData.GetPartnerProfileAsync(
                new PartnerProfileRequest { WorkspaceId = workspaceId, PartnerId = customerId },
                GrpcCallContext.Forward(accessor, ct)),
            ct,
            _ => new BookAuthorityUnavailableException(),
            _ => new BusinessConflictException("The invoice reference is inactive."));
        if (partner.Id != customerId || !partner.IsActive || !partner.Roles.Contains("customer", StringComparer.Ordinal))
            throw new BusinessConflictException("An active customer is required.");
        return new(partner.Id, partner.Name, partner.ContactEmails.Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase).ToArray());
    }

    public async Task<ServiceReference> ServiceAsync(Guid workspaceId, Guid itemId, CancellationToken ct)
    {
        DemandBearer();
        var item = await GrpcErrorMapper.CallAsync(
            () => masterData.GetItemReferenceAsync(
                new ItemReferenceRequest { WorkspaceId = workspaceId, ItemId = itemId, Inventory = false },
                GrpcCallContext.Forward(accessor, ct)),
            ct,
            _ => new BookAuthorityUnavailableException(),
            _ => new BusinessConflictException("The invoice reference is inactive."));
        if (item.ItemId != itemId || !item.IsActive || item.TracksInventory || item.Kind != "service")
            throw new BusinessConflictException("Recurring invoices require an active non-stock service item.");
        return new(item.ItemId, item.Name);
    }

    private void DemandBearer()
    {
        if (!AuthenticationHeaderValue.TryParse(accessor.HttpContext?.Request.Headers.Authorization.ToString(), out var token)
            || !token.Scheme.Equals("Bearer", StringComparison.OrdinalIgnoreCase)) throw new AccessDeniedException();
    }
}
