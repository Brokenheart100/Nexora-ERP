using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Application;

public sealed record PartnerSummary(Guid Id, string Code, string Name, IReadOnlyList<string> Roles, bool IsActive, long Version);

public sealed record PartnerList(IReadOnlyList<PartnerSummary> Items, bool HasMore, bool CanManage);

public sealed record PartnerDetail(Guid Id, string Code, string Name, IReadOnlyList<string> Roles,
    bool IsActive, long Version, string? TaxNumber, string? Address, IReadOnlyList<PartnerContactInput> Contacts);

public sealed record PartnerReference(Guid Id, string Code, string Name, string Role, long Version);
