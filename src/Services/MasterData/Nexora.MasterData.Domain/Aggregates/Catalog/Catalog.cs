namespace Nexora.MasterData.Domain;

public sealed class CatalogDefinition
{
    private CatalogDefinition() { }

    public CatalogDefinition(Guid tenantId, Guid workspaceId, DefinitionKind kind, CatalogCode code, string name)
    {
        if (!Enum.IsDefined(kind)) throw new CatalogRuleException("Unknown catalog definition kind.");
        Id = Guid.CreateVersion7();
        TenantId = tenantId;
        WorkspaceId = workspaceId;
        Kind = kind;
        Code = code;
        Name = CatalogCode.Name(name);
        IsActive = true;
        Version = 1;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public DefinitionKind Kind { get; private set; }
    public CatalogCode Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public bool IsActive { get; private set; }
    public long Version { get; private set; }

    public void Revise(string name, bool isActive)
    {
        Name = CatalogCode.Name(name);
        IsActive = isActive;
        Version++;
    }
}

public sealed class CatalogItem
{
    private CatalogItem() { }

    public CatalogItem(Guid tenantId, Guid workspaceId, CatalogCode code, string name,
        ItemKind kind, bool tracksInventory, CatalogDefinition category, CatalogDefinition unit)
    {
        Id = Guid.CreateVersion7();
        TenantId = tenantId;
        WorkspaceId = workspaceId;
        Code = code;
        if (!Enum.IsDefined(kind) || kind == ItemKind.Service && tracksInventory)
            throw new CatalogRuleException("Only products can track inventory.");
        Kind = kind;
        TracksInventory = tracksInventory;
        DemandReference(category, DefinitionKind.Category);
        DemandReference(unit, DefinitionKind.Unit);
        UnitId = unit.Id;
        ChangeDetails(name, category);
        IsActive = true;
        Version = 1;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public CatalogCode Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public ItemKind Kind { get; private set; }
    public bool TracksInventory { get; private set; }
    public Guid CategoryId { get; private set; }
    public Guid UnitId { get; private set; }
    public bool IsActive { get; private set; }
    public long Version { get; private set; }

    public void Revise(string name, CatalogDefinition category, bool isActive)
    {
        ChangeDetails(name, category);
        IsActive = isActive;
        Version++;
    }

    private void ChangeDetails(string name, CatalogDefinition category)
    {
        DemandReference(category, DefinitionKind.Category);
        Name = CatalogCode.Name(name);
        CategoryId = category.Id;
    }

    private void DemandReference(CatalogDefinition definition, DefinitionKind kind)
    {
        if (definition.Kind != kind || definition.TenantId != TenantId || definition.WorkspaceId != WorkspaceId)
            throw new CatalogRuleException("The catalog reference is outside the item scope or has the wrong kind.");
    }
}
