using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed partial class LedgerUseCases
{
    public async Task<JournalLinkView[]> LinksAsync(Guid workspaceId, Guid? journalId, int page, CancellationToken ct)
    {
        var (current, _) = await ReadBookAsync(workspaceId, ct);
        current.Demand(LedgerPermissions.Read);
        if (page is < 1 or > 100_000) throw new ArgumentException("Invalid page.");
        if (journalId is Guid id && await store.FindAsync(current.Scope, id, false, ct) is null)
            throw new ResourceNotFoundException();
        return await store.LinksAsync(current.Scope, journalId, page, ct);
    }

    public async Task<JournalLinkChange> CreateLinkAsync(CreateJournalLink command, CancellationToken ct)
    {
        const string action = "journal.link.created";
        var (current, book) = await BeginAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return LinkChange(replay);
        var from = await store.FindAsync(current.Scope, command.FromJournalId, false, ct) ?? throw new ResourceNotFoundException();
        var to = await store.FindAsync(current.Scope, command.ToJournalId, false, ct) ?? throw new ResourceNotFoundException();
        current.DemandOn(LedgerPermissions.Draft, from.On);
        current.DemandOn(LedgerPermissions.Draft, to.On);
        var kind = JournalLinkKinds.Parse(command.Kind);
        if (from.State != JournalState.Posted || to.State != JournalState.Posted)
            throw new LedgerRuleException("Only posted journals can be linked.");
        if (await store.LinkExistsAsync(current.Scope, from.Id, to.Id, kind, ct))
            throw new BusinessConflictException("These journals are already linked with this kind.");
        var link = JournalLink.Create(current.Scope.TenantId, current.Scope.WorkspaceId, from.Id, to.Id, kind,
            command.Memo, Actor(current), clock.GetUtcNow());
        store.Add(link);
        mutations.Record(current, command.OperationId, action, command, link.Id, link.Version);
        return new(link.Id, link.Version);
    }

    public async Task<JournalLinkChange> DeleteLinkAsync(DeleteJournalLink command, CancellationToken ct)
    {
        const string action = "journal.link.deleted";
        var (current, _) = await BeginAsync(command.WorkspaceId, LedgerPermissions.Draft, ct);
        current.Demand(LedgerPermissions.Draft);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return LinkChange(replay);
        var link = await store.FindLinkAsync(current.Scope, command.LinkId, true, ct) ?? throw new ResourceNotFoundException();
        DemandVersion(link.Version, command.ExpectedVersion);
        store.Remove(link);
        mutations.Record(current, command.OperationId, action, command, link.Id, link.Version);
        return new(link.Id, link.Version);
    }

    public async Task<JournalLinkScan> ScanLinksAsync(Guid workspaceId, CancellationToken ct)
    {
        var (current, _) = await ReadBookAsync(workspaceId, ct);
        current.Demand(LedgerPermissions.Read);
        var links = await store.AllLinksAsync(current.Scope, ct);
        var rows = await store.JournalScanRowsAsync(current.Scope, ct);
        var byId = rows.ToDictionary(x => x.Id);
        var issues = new List<JournalLinkIssue>();
        foreach (var link in links)
        {
            if (!byId.TryGetValue(link.FromJournalId, out var from))
                issues.Add(new("link.from_missing", link.Id, link.FromJournalId, "关联来源凭证不存在。"));
            else if (from.State != JournalState.Posted)
                issues.Add(new("link.from_not_posted", link.Id, link.FromJournalId, "关联来源凭证不是已过账状态。"));
            if (!byId.TryGetValue(link.ToJournalId, out var to))
                issues.Add(new("link.to_missing", link.Id, link.ToJournalId, "关联目标凭证不存在。"));
            else if (to.State != JournalState.Posted)
                issues.Add(new("link.to_not_posted", link.Id, link.ToJournalId, "关联目标凭证不是已过账状态。"));
        }
        foreach (var group in links.GroupBy(x => (x.FromJournalId, x.ToJournalId)).Where(x => x.Count() > 1))
            issues.Add(new("link.duplicate_pair", group.First().Id, null, "同一对凭证存在多条关联。"));
        foreach (var row in rows.Where(x => x.ReversesId is Guid original && !byId.ContainsKey(original)))
            issues.Add(new("journal.reversal_missing_original", null, row.Id, "冲销凭证引用的原凭证不存在。"));
        return new(clock.GetUtcNow(), links.Length, rows.Length, issues.ToArray());
    }

    private static JournalLinkChange LinkChange(FinanceAudit audit) => new(audit.TargetId!.Value, audit.ResultVersion);
}
