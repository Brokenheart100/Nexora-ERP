using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nexora.Finance.Domain;

namespace Nexora.Finance.Infrastructure;

internal static class ReceivableModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        var setup = model.Entity<ReceivableSetup>();
        setup.ToTable("receivable_setup");
        setup.HasKey(x => new { x.TenantId, x.WorkspaceId });
        setup.Property(x => x.Accounts).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<ReceivableAccounts>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb");
        var doc = model.Entity<CustomerDocument>();
        doc.ToTable("customer_documents");
        doc.Property(x => x.Id).ValueGeneratedNever();
        doc.Property(x => x.Version).IsConcurrencyToken();
        doc.Property(x => x.Number).HasMaxLength(60);
        doc.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Number }).IsUnique();
        doc.HasIndex(x => new { x.TenantId, x.WorkspaceId, x.Id });
        doc.Property(x => x.MakerIssuer).HasMaxLength(500);
        doc.Property(x => x.MakerSubject).HasMaxLength(200);
        doc.Property(x => x.OpenBalance).HasPrecision(20, 6);
        doc.Property(x => x.Terms).HasConversion(x => JsonSerializer.Serialize(x, (JsonSerializerOptions?)null),
            x => JsonSerializer.Deserialize<CustomerTerms>(x, (JsonSerializerOptions?)null)!).HasColumnType("jsonb");
    }
}
