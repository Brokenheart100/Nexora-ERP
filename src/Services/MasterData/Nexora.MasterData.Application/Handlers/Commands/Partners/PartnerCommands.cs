using Nexora.BuildingBlocks.Application;
using Nexora.MasterData.Domain;
using Nexora.MasterData.Contracts;

namespace Nexora.MasterData.Application;

public sealed class PartnerCommands(CatalogMutations mutations, IPartnerRepository repository)
{
    public Task<CatalogOutcome> ExecuteAsync(AddPartner command, CancellationToken cancellationToken) =>
        mutations.ExecuteAsync(command.WorkspaceId, PartnerPermissions.Manage, command.OperationId,
            "partner.created", command, (scope, stamp, _) =>
            {
                var partner = new BusinessPartner(scope.TenantId, scope.WorkspaceId, new(command.Code), command.Profile);
                repository.Add(partner);
                return Task.FromResult(Changed(stamp, partner));
            }, cancellationToken);

    public Task<CatalogOutcome> ExecuteAsync(RevisePartner command, CancellationToken cancellationToken) =>
        mutations.ExecuteAsync(command.WorkspaceId, PartnerPermissions.Manage, command.OperationId,
            "partner.revised", command, async (scope, stamp, ct) =>
            {
                var partner = await repository.FindAsync(scope, command.PartnerId, ct) ?? throw new ResourceNotFoundException();
                if (partner.Version != command.ExpectedVersion) throw new RevisionConflictException("The partner has changed.");
                partner.Revise(command.Profile, command.IsActive);
                return Changed(stamp, partner);
            }, cancellationToken);

    private static MasterDataChangedV1 Changed(ChangeStamp stamp, BusinessPartner partner) =>
        new(stamp.EventId, partner.TenantId, partner.WorkspaceId, "partner", partner.Id, partner.Version,
            partner.Code.Value, partner.Name, partner.IsActive, stamp.OccurredAtUtc,
            PartnerRoles: PartnerRoleCodes.List(partner.Roles));
}
