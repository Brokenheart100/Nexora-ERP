namespace Nexora.Organization.Application;

public sealed record Announcement(string Id, string Title, string Message, DateTimeOffset StartsAtUtc, DateTimeOffset EndsAtUtc,
    Guid[]? Workspaces = null, string? RequiredPermission = null);

public sealed record AnnouncementView(string Id, string Title, string Message, DateTimeOffset EndsAtUtc);
