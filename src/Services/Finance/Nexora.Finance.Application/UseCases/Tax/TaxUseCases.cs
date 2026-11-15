using System.Text.Json;
using Nexora.BuildingBlocks.Application;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Application;

public sealed class TaxUseCases(IBookAccess access, IBookStore books, IChartStore chart, ITaxStore store,
    ITaxReferenceAuthority references, FinanceMutation mutations, TimeProvider clock)
{
    public const string Manage = "finance.tax.manage";

    public async Task<TaxSetup> ReadAsync(Guid workspaceId, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        if (await books.FindAsync(current.Scope, ct) is null) throw new ResourceNotFoundException();
        return new(current.Allows(Manage), await store.RatesAsync(current.Scope, ct),
            (await store.GroupsAsync(current.Scope, ct)).Select(GroupView).ToArray(),
            await store.ClassificationsAsync(current.Scope, null, null, ct));
    }

    public async Task<TaxChange> SaveAsync(SetTaxRate command, CancellationToken ct)
    {
        const string action = "tax.rate.created";
        var (current, _) = await BeginAsync(command.WorkspaceId, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Change(replay);
        var code = Code(command.Code);
        if (command.EffectiveOn.Year is < 1900 or > 9998 || !TaxCalculation.ValidNumber(command.Rate, 0, 1))
            throw new ArgumentException("Invalid rate, effective date, or precision.");
        if ((await store.RatesAsync(current.Scope, ct)).Any(x => x.Code == code && x.EffectiveOn == command.EffectiveOn))
            throw new BusinessConflictException("A rate already exists for that effective date.");
        var rate = new TaxRate(Guid.CreateVersion7(), current.Scope.TenantId, current.Scope.WorkspaceId, code,
            Name(command.Name), command.EffectiveOn, command.Rate);
        store.Add(rate);
        mutations.Record(current, command.OperationId, action, command, rate.Id, 1);
        return new(rate.Id, 1);
    }

    public async Task<TaxChange> SaveAsync(SetTaxGroup command, CancellationToken ct)
    {
        const string action = "tax.group.saved";
        var (current, _) = await BeginAsync(command.WorkspaceId, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Change(replay);
        var code = Code(command.Code);
        if (command.RateCodes is not { Length: >= 1 and <= 8 }) throw new ArgumentException("Choose between one and eight tax codes.");
        var rateCodes = command.RateCodes.Select(Code).Order(StringComparer.Ordinal).ToArray();
        if (rateCodes.Distinct(StringComparer.Ordinal).Count() != rateCodes.Length) throw new ArgumentException("Tax codes must be unique.");
        var knownCodes = (await store.RatesAsync(current.Scope, ct)).Select(x => x.Code).ToHashSet(StringComparer.Ordinal);
        if (rateCodes.Any(x => !knownCodes.Contains(x))) throw new BusinessConflictException("An unknown tax code was supplied.");
        var existing = (await store.GroupsAsync(current.Scope, ct)).SingleOrDefault(x => x.Code == code);
        var version = Next(existing?.Version, command.ExpectedVersion);
        var group = new TaxGroup(Guid.CreateVersion7(), current.Scope.TenantId, current.Scope.WorkspaceId,
            code, Name(command.Name), version, string.Join(',', rateCodes));
        store.Add(group);
        mutations.Record(current, command.OperationId, action, command, group.Id, version);
        return new(group.Id, version);
    }

    public async Task<TaxChange> ClassifyAsync(ClassifyForTax command, CancellationToken ct)
    {
        const string action = "tax.classification.saved";
        if (command.Kind is not ("item" or "partner") || command.ResourceId == Guid.Empty)
            throw new ArgumentException("An item or partner identifier is required.");
        var (current, _) = await BeginAsync(command.WorkspaceId, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return Change(replay);
        var code = Code(command.GroupCode);
        if (!(await store.GroupsAsync(current.Scope, ct)).Any(x => x.Code == code)) throw new ResourceNotFoundException();
        var referenceVersion = await references.DemandActiveAsync(command.WorkspaceId, command.Kind, command.ResourceId, ct);
        var candidates = await store.ClassificationsAsync(current.Scope, command.Kind == "item" ? command.ResourceId : null,
            command.Kind == "partner" ? command.ResourceId : null, ct);
        var version = Next(candidates.SingleOrDefault()?.Version, command.ExpectedVersion);
        var classification = new TaxClassification(Guid.CreateVersion7(), current.Scope.TenantId, current.Scope.WorkspaceId,
            command.Kind, command.ResourceId, code, version, referenceVersion);
        store.Add(classification);
        mutations.Record(current, command.OperationId, action, command, classification.Id, version);
        return new(classification.Id, version);
    }

    public async Task<TaxSnapshot> AssessAsync(AssessTax command, CancellationToken ct)
    {
        const string action = "tax.assessed";
        var (current, book) = await BeginAsync(command.WorkspaceId, ct);
        var replay = await mutations.ReplayAsync(current, command.OperationId, action, command, ct);
        if (replay is not null) return await SnapshotAsync(current.Scope, replay.TargetId!.Value, ct);
        if (command.On < book.StartsOn || command.On.Year > 9998) throw new ArgumentException("Invalid tax calculation date.");
        var applied = new List<TaxReference>();
        var classifications = command.ItemId is null && command.PartnerId is null ? []
            : await store.ClassificationsAsync(current.Scope, command.ItemId, command.PartnerId, ct);
        await AddReference("item", command.ItemId);
        await AddReference("partner", command.PartnerId);
        var classification = classifications.SingleOrDefault(x => x.Kind == "partner")
            ?? classifications.SingleOrDefault(x => x.Kind == "item");
        var groupCode = command.GroupCode is null ? classification?.GroupCode : Code(command.GroupCode);
        var group = (await store.GroupsAsync(current.Scope, ct)).SingleOrDefault(x => x.Code == groupCode)
            ?? throw new BusinessConflictException("No applicable tax group was found.");
        var view = GroupView(group);
        var history = await store.RatesAsync(current.Scope, ct);
        var rates = view.RateCodes.Select(code => history.Where(x => x.Code == code && x.EffectiveOn <= command.On)
            .MaxBy(x => x.EffectiveOn) ?? throw new BusinessConflictException("A tax code has no effective rate on that date.")).ToArray();
        var amounts = TaxCalculation.Calculate(book.MinorUnits, command.UnitPrice, command.Quantity, command.Discount, command.IncludesTax, rates);
        var id = Guid.CreateVersion7();
        var snapshot = new TaxSnapshot(id, command.On, book.BaseCurrency, book.MinorUnits, TaxCalculation.Policy, view,
            applied.ToArray(), command.UnitPrice, command.Quantity, command.Discount, command.IncludesTax, amounts,
            command.GroupCode is null ? classification?.Kind : "explicit");
        store.Add(new TaxAssessment(id, book.TenantId, book.WorkspaceId, JsonSerializer.Serialize(snapshot), clock.GetUtcNow()));
        mutations.Record(current, command.OperationId, action, command, id, 1);
        return snapshot;

        async Task AddReference(string kind, Guid? id)
        {
            if (id is not Guid resourceId) return;
            var version = await references.DemandActiveAsync(command.WorkspaceId, kind, resourceId, ct);
            applied.Add(new(kind, resourceId, version, classifications.SingleOrDefault(x => x.Kind == kind)?.Version));
        }
    }

    public async Task<TaxSnapshot> ReadSnapshotAsync(Guid workspaceId, Guid id, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        return await SnapshotAsync(current.Scope, id, ct);
    }

    private async Task<TaxSnapshot> SnapshotAsync(ResourceScope scope, Guid id, CancellationToken ct) =>
        JsonSerializer.Deserialize<TaxSnapshot>((await store.FindAsync(scope, id, ct) ?? throw new ResourceNotFoundException()).SnapshotJson)!;

    private async Task<(BookAccess, AccountingBook)> BeginAsync(Guid workspaceId, CancellationToken ct)
    {
        var current = await access.DemandAsync(workspaceId, false, ct);
        current.Demand(Manage);
        return (current, await chart.LockBookAsync(current.Scope, ct) ?? throw new ResourceNotFoundException());
    }

    private static TaxGroupView GroupView(TaxGroup group) => new(group.Code, group.Name, group.Version, group.RateCodes.Split(','));
    private static TaxChange Change(FinanceAudit audit) => new(audit.TargetId!.Value, audit.ResultVersion);
    private static long Next(long? existing, long expected) => (existing ?? 0) == expected
        ? expected + 1 : throw new BusinessConflictException("Tax configuration changed. Refresh and retry.");
    private static string Code(string value)
    {
        var code = value?.Trim().ToUpperInvariant() ?? "";
        if (code.Length is < 1 or > 40 || code.Any(x => !(char.IsAsciiLetterOrDigit(x) || x is '-' or '_')))
            throw new ArgumentException("Invalid tax code.");
        return code;
    }
    private static string Name(string value)
    {
        var name = value?.Trim() ?? "";
        if (name.Length is < 1 or > 160) throw new ArgumentException("Invalid tax name.");
        return name;
    }
}
