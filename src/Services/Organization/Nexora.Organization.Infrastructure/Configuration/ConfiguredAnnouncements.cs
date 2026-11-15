using Microsoft.Extensions.Configuration;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class ConfiguredAnnouncements(IConfiguration configuration) : IAnnouncementSource
{
    public IReadOnlyList<Announcement> Read() => configuration.GetSection("Announcements").Get<Announcement[]>()?
        .Where(x => x is { Id.Length: > 0 and <= 80, Title.Length: > 0 and <= 160, Message.Length: > 0 and <= 2000 }
            && x.EndsAtUtc > x.StartsAtUtc
            && (x.RequiredPermission is null || WorkspacePermissions.All.Contains(x.RequiredPermission, StringComparer.Ordinal)))
        .DistinctBy(x => x.Id, StringComparer.Ordinal).Take(100).ToArray() ?? [];
}
