using Nexora.MasterData.Application;
using Nexora.MasterData.Contracts.Grpc;

namespace Nexora.MasterData.Api.Grpc;

// Ordinary Wolverine handlers behind the generated code-first gRPC service.
public static class MasterDataGrpcHandler
{
    public static async Task<PartnerReferenceReply> Handle(PartnerReferenceRequest request,
        PartnerQueries partners, CancellationToken cancellationToken)
    {
        var partner = await partners.ReferenceAsync(request.WorkspaceId, request.PartnerId, request.Role, cancellationToken);
        return new PartnerReferenceReply
        {
            Id = partner.Id,
            Code = partner.Code,
            Name = partner.Name,
            Role = partner.Role,
            Version = partner.Version
        };
    }

    public static async Task<PartnerProfileReply> Handle(Nexora.MasterData.Contracts.Grpc.PartnerProfileRequest request,
        PartnerQueries partners, CancellationToken cancellationToken)
    {
        var partner = await partners.DetailAsync(request.WorkspaceId, request.PartnerId, cancellationToken);
        return new PartnerProfileReply
        {
            Id = partner.Id,
            Code = partner.Code,
            Name = partner.Name,
            IsActive = partner.IsActive,
            Roles = partner.Roles.ToArray(),
            ContactEmails = partner.Contacts
                .Where(contact => !string.IsNullOrWhiteSpace(contact.Email))
                .Select(contact => contact.Email!.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray(),
            Version = partner.Version
        };
    }

    public static async Task<ItemReferenceReply> Handle(ItemReferenceRequest request,
        CatalogQueries catalog, CancellationToken cancellationToken)
    {
        var reference = await catalog.ReferenceAsync(request.WorkspaceId, request.ItemId, request.Inventory, cancellationToken);
        return new ItemReferenceReply
        {
            ItemId = reference.Item.Id,
            Code = reference.Item.Code,
            Name = reference.Item.Name,
            Kind = reference.Item.Kind,
            TracksInventory = reference.Item.TracksInventory,
            IsActive = reference.Item.IsActive,
            Version = reference.Item.Version,
            CategoryId = reference.Category.Id,
            CategoryCode = reference.Category.Code,
            CategoryName = reference.Category.Name,
            CategoryVersion = reference.Category.Version,
            UnitId = reference.Unit.Id,
            UnitCode = reference.Unit.Code,
            UnitName = reference.Unit.Name,
            UnitVersion = reference.Unit.Version
        };
    }
}
