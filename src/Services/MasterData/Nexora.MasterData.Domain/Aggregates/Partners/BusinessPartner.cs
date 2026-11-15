using System.Net.Mail;

namespace Nexora.MasterData.Domain;

public sealed class BusinessPartner
{
    private readonly List<PartnerContact> _contacts = [];
    private BusinessPartner() { }

    public BusinessPartner(Guid tenantId, Guid workspaceId, CatalogCode code, PartnerProfile profile)
    {
        Id = Guid.CreateVersion7();
        TenantId = tenantId;
        WorkspaceId = workspaceId;
        Code = code;
        ApplyProfile(profile);
        IsActive = true;
        Version = 1;
    }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public Guid WorkspaceId { get; private set; }
    public CatalogCode Code { get; private set; } = null!;
    public string Name { get; private set; } = null!;
    public string? TaxNumber { get; private set; }
    public string? Address { get; private set; }
    public PartnerRoles Roles { get; private set; }
    public bool IsActive { get; private set; }
    public long Version { get; private set; }
    public IReadOnlyList<PartnerContact> Contacts => _contacts.AsReadOnly();

    public void Revise(PartnerProfile profile, bool isActive)
    {
        ApplyProfile(profile);
        IsActive = isActive;
        Version++;
    }

    private void ApplyProfile(PartnerProfile profile)
    {
        const PartnerRoles all = PartnerRoles.Customer | PartnerRoles.Supplier | PartnerRoles.Donor;
        if (profile.Roles == 0 || (profile.Roles & ~all) != 0)
            throw new CatalogRuleException("Select at least one valid partner role.");
        if (profile.Contacts is null || profile.Contacts.Count > 20)
            throw new CatalogRuleException("Supply at most 20 contacts.");

        var name = CatalogCode.Name(profile.Name);
        var taxNumber = OptionalText(profile.TaxNumber, 64);
        var address = OptionalText(profile.Address, 300);
        var existing = _contacts.ToDictionary(contact => contact.Id);
        var retained = new HashSet<Guid>();
        var contacts = new List<PartnerContact>();
        foreach (var input in profile.Contacts)
        {
            if (input is null) throw new CatalogRuleException("Invalid contact.");
            if (input.Id is { } id && (!existing.ContainsKey(id) || !retained.Add(id)))
                throw new CatalogRuleException("A contact must belong to this partner and appear once.");
            contacts.Add(new PartnerContact(input));
        }

        Name = name;
        TaxNumber = taxNumber;
        Address = address;
        Roles = profile.Roles;
        _contacts.RemoveAll(contact => !retained.Contains(contact.Id));
        foreach (var contact in contacts)
        {
            if (existing.TryGetValue(contact.Id, out var current))
                current.UpdateDetails(contact);
            else
                _contacts.Add(contact);
        }
    }

    internal static string? OptionalText(string? value, int maximumLength)
    {
        var trimmed = value?.Trim();
        if (string.IsNullOrEmpty(trimmed)) return null;
        if (trimmed.Length > maximumLength || trimmed.Any(char.IsControl))
            throw new CatalogRuleException("The value exceeds its length limit or contains a control character.");
        return trimmed;
    }
}

public sealed class PartnerContact
{
    private PartnerContact() { }

    internal PartnerContact(PartnerContactInput input)
    {
        Id = input.Id ?? Guid.CreateVersion7();
        Name = CatalogCode.Name(input.Name);
        Email = BusinessPartner.OptionalText(input.Email, 254);
        if (Email is not null && (!MailAddress.TryCreate(Email, out var parsed) || parsed.Address != Email || !Email.Contains('@')))
            throw new CatalogRuleException("Invalid contact email.");
        Phone = BusinessPartner.OptionalText(input.Phone, 40);
    }

    public Guid Id { get; private set; }
    public string Name { get; private set; } = null!;
    public string? Email { get; private set; }
    public string? Phone { get; private set; }

    internal void UpdateDetails(PartnerContact contact)
    {
        Name = contact.Name;
        Email = contact.Email;
        Phone = contact.Phone;
    }
}
