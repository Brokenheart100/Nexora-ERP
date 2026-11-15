using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.MasterData.Application;
using Nexora.MasterData.Domain;

namespace Nexora.MasterData.Infrastructure;

internal static class MasterDataModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        model.HasDefaultSchema("masterdata");
        var definitions = model.Entity<CatalogDefinition>();
        definitions.ToTable("definitions");
        definitions.HasAlternateKey(x => new { x.TenantId, x.WorkspaceId, x.Id });
        definitions.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Kind, x.Code }).IsUnique();
        definitions.Property(x => x.Code).HasConversion(x => x.Value, x => new CatalogCode(x)).HasMaxLength(40);
        definitions.Property(x => x.Name).HasMaxLength(160);
        definitions.Property(x => x.IsActive).HasDefaultValue(true);
        definitions.Property(x => x.Version).HasDefaultValue(1L).IsConcurrencyToken();

        var items = model.Entity<CatalogItem>();
        items.ToTable("items", table => table.HasCheckConstraint("ck_items_kind_inventory",
            """("Kind" = 1) OR ("Kind" = 2 AND NOT "TracksInventory")"""));
        items.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Code }).IsUnique();
        items.Property(x => x.Code).HasConversion(x => x.Value, x => new CatalogCode(x)).HasMaxLength(40);
        items.Property(x => x.Name).HasMaxLength(160);
        items.Property(x => x.Version).IsConcurrencyToken();
        items.HasOne<CatalogDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.CategoryId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);
        items.HasOne<CatalogDefinition>().WithMany().HasForeignKey(x => new { x.TenantId, x.WorkspaceId, x.UnitId })
            .HasPrincipalKey(x => new { x.TenantId, x.WorkspaceId, x.Id }).OnDelete(DeleteBehavior.Restrict);

        var receipts = model.Entity<CatalogReceipt>();
        receipts.ToTable("mutation_audit");
        receipts.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Issuer, x.Subject, x.OperationId }).IsUnique();
        receipts.Property(x => x.Issuer).HasMaxLength(500);
        receipts.Property(x => x.Subject).HasMaxLength(200);
        receipts.Property(x => x.Action).HasMaxLength(80);
        receipts.Property(x => x.Fingerprint).HasMaxLength(64);

        var partners = model.Entity<BusinessPartner>();
        partners.ToTable("partners", table => table.HasCheckConstraint("ck_partners_roles", "\"Roles\" BETWEEN 1 AND 7"));
        partners.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Code }).IsUnique();
        partners.Property(x => x.Code).HasConversion(x => x.Value, x => new CatalogCode(x)).HasMaxLength(40);
        partners.Property(x => x.Name).HasMaxLength(160);
        partners.Property(x => x.TaxNumber).HasMaxLength(64);
        partners.Property(x => x.Address).HasMaxLength(300);
        partners.Property(x => x.Version).IsConcurrencyToken();
        partners.OwnsMany(x => x.Contacts, contacts =>
        {
            contacts.ToTable("partner_contacts");
            contacts.WithOwner().HasForeignKey("PartnerId");
            contacts.HasKey("PartnerId", nameof(PartnerContact.Id));
            contacts.Property(x => x.Id).ValueGeneratedNever();
            contacts.Property(x => x.Name).HasMaxLength(160);
            contacts.Property(x => x.Email).HasMaxLength(254);
            contacts.Property(x => x.Phone).HasMaxLength(40);
        });
        partners.Navigation(x => x.Contacts).HasField("_contacts").UsePropertyAccessMode(PropertyAccessMode.Field);
        RecordChangeConfiguration.Configure(model);
    }
}
