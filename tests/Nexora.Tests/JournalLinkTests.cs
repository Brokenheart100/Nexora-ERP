using Nexora.Finance.Domain;

namespace Nexora.Tests;

public sealed class JournalLinkTests
{
    private static readonly JournalActor Creator = new("https://id.example/realms/erp", "link-owner");
    private static readonly Guid TenantId = Guid.CreateVersion7();
    private static readonly Guid WorkspaceId = Guid.CreateVersion7();
    private static readonly DateTimeOffset Now = new(2026, 11, 14, 8, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Links_require_distinct_journals_and_known_kinds()
    {
        var journal = Guid.CreateVersion7();
        Assert.Throws<LedgerRuleException>(() => JournalLink.Create(TenantId, WorkspaceId, journal, journal,
            JournalLinkKinds.Related, null, Creator, Now));
        Assert.Throws<ArgumentException>(() => JournalLink.Create(TenantId, WorkspaceId, journal, Guid.CreateVersion7(),
            "settled", null, Creator, Now));
        Assert.Throws<ArgumentException>(() => JournalLink.Create(TenantId, WorkspaceId, Guid.Empty, Guid.CreateVersion7(),
            JournalLinkKinds.Related, null, Creator, Now));
        Assert.Throws<ArgumentException>(() => JournalLink.Create(TenantId, WorkspaceId, journal, Guid.CreateVersion7(),
            JournalLinkKinds.Adjustment, new string('x', 301), Creator, Now));
        Assert.Equal(["related", "adjustment", "settlement"], JournalLinkKinds.All);
        Assert.Equal("settlement", JournalLinkKinds.Parse(" Settlement "));
    }

    [Fact]
    public void Link_captures_creator_kind_and_note()
    {
        var from = Guid.CreateVersion7();
        var to = Guid.CreateVersion7();
        var link = JournalLink.Create(TenantId, WorkspaceId, from, to, JournalLinkKinds.Adjustment,
            "  期末调整关联  ", Creator, Now);

        Assert.Equal(TenantId, link.TenantId);
        Assert.Equal(WorkspaceId, link.WorkspaceId);
        Assert.Equal(from, link.FromJournalId);
        Assert.Equal(to, link.ToJournalId);
        Assert.Equal(JournalLinkKinds.Adjustment, link.Kind);
        Assert.Equal("期末调整关联", link.Memo);
        Assert.Equal(Creator.Issuer, link.CreatedByIssuer);
        Assert.Equal(Creator.Subject, link.CreatedBySubject);
        Assert.Equal(Now, link.CreatedAtUtc);
        Assert.Equal(1, link.Version);
        Assert.NotEqual(Guid.Empty, link.Id);
    }
}
