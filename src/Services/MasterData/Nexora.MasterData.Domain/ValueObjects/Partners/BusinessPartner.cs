namespace Nexora.MasterData.Domain;

public sealed record PartnerContactInput(Guid? Id, string Name, string? Email, string? Phone);

public sealed record PartnerProfile(string Name, string? TaxNumber, string? Address,
    PartnerRoles Roles, IReadOnlyList<PartnerContactInput> Contacts);
