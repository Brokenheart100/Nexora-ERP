using Nexora.MasterData.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Api;

public sealed record PartnerProfileRequest(string Name, string? TaxNumber, string? Address,
    string[] Roles, PartnerContactInput[] Contacts)
{
    public PartnerProfile ToProfile()
    {
        var roles = Roles.Aggregate((PartnerRoles)0, (current, code) => current | PartnerRoleCodes.Parse(code));
        return new(Name, TaxNumber, Address, roles, Contacts);
    }
}

public sealed record AddPartnerRequest(Guid OperationId, string Code, PartnerProfileRequest Profile);

public sealed record RevisePartnerRequest(Guid OperationId, long ExpectedVersion, PartnerProfileRequest Profile, bool? IsActive);
