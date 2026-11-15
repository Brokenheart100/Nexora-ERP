using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Tests;

public sealed class SessionPolicyTests
{
    private static readonly CompanyPresentation Presentation =
        new("测试商贸", "测试商贸", "#274580", "yyyy-MM-dd", "Asia/Shanghai", null);

    private static WorkspaceView Workspace(string name, Guid id) =>
        new(id, Guid.NewGuid(), name, "CN", "CNY", 0);

    [Fact]
    public void Workspace_session_idle_timeout_defaults_to_thirty_minutes()
    {
        var preferences = new WorkspacePreferences(Guid.NewGuid(), Guid.NewGuid());
        Assert.Equal(30, preferences.SessionIdleMinutes);
        Assert.Equal(0, preferences.Version);
    }

    [Fact]
    public void Revising_settings_can_update_the_idle_timeout_and_keeps_the_previous_value_when_omitted()
    {
        var preferences = new WorkspacePreferences(Guid.NewGuid(), Guid.NewGuid());
        preferences.Revise(Presentation, 15);
        Assert.Equal(15, preferences.SessionIdleMinutes);
        Assert.Equal(1, preferences.Version);

        preferences.Revise(Presentation);
        Assert.Equal(15, preferences.SessionIdleMinutes);
        Assert.Equal(2, preferences.Version);

        Assert.Throws<ArgumentException>(() => preferences.Revise(Presentation, 0));
        Assert.Throws<ArgumentException>(() => preferences.Revise(Presentation, 481));
        Assert.Equal(15, preferences.SessionIdleMinutes);
    }

    [Fact]
    public void Session_policy_uses_the_shortest_workspace_timeout_and_names_every_source()
    {
        var alpha = Workspace("阿尔法", Guid.NewGuid());
        var beta = Workspace("贝塔", Guid.NewGuid());
        var gamma = Workspace("伽马", Guid.NewGuid());
        var workspaces = new[] { gamma, beta, alpha };
        var idle = new Dictionary<Guid, int> { [alpha.Id] = 45, [beta.Id] = 15, [gamma.Id] = 15 };

        var (minimum, sources) = SessionPolicySelection.Select(workspaces, idle);

        Assert.Equal(15, minimum);
        // Ordinal name ordering places 「伽马」 before 「贝塔」 (U+4F3D < U+8D1D).
        Assert.Equal(new[] { gamma.Id, beta.Id }, sources.Select(source => source.WorkspaceId));
        Assert.All(sources, source => Assert.Equal(15, source.IdleTimeoutMinutes));
    }

    [Fact]
    public void Session_policy_defaults_missing_workspace_preferences_and_empty_accounts_to_thirty_minutes()
    {
        var configured = Workspace("已配置", Guid.NewGuid());
        var unconfigured = Workspace("未配置", Guid.NewGuid());
        var (minimum, sources) = SessionPolicySelection.Select([configured, unconfigured],
            new Dictionary<Guid, int> { [configured.Id] = 30 });
        Assert.Equal(30, minimum);
        Assert.Equal(2, sources.Length);

        var (fallback, emptySources) = SessionPolicySelection.Select([], new Dictionary<Guid, int>());
        Assert.Equal(30, fallback);
        Assert.Empty(emptySources);
    }
}
