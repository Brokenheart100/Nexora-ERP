using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

internal static class OrganizationModelConfiguration
{
    internal static void Configure(ModelBuilder model)
    {
        model.HasDefaultSchema("organization");
        var workspace = model.Entity<Workspace>();
        workspace.ToTable("workspaces");
        workspace.HasKey(x => x.Id);
        workspace.Property(x => x.Name).HasMaxLength(160).IsRequired();
        workspace.Property(x => x.OwnerIssuer).HasMaxLength(500).IsRequired();
        workspace.Property(x => x.OwnerSubject).HasMaxLength(200).IsRequired();
        workspace.Property(x => x.CountryCode).HasMaxLength(2).IsRequired();
        workspace.Property(x => x.BaseCurrency).HasMaxLength(3).IsRequired();
        workspace.Property(x => x.Version).IsConcurrencyToken();
        workspace.HasIndex(x => new { x.OwnerIssuer, x.OwnerSubject, x.OperationId }).IsUnique();
        workspace.HasIndex(x => new { x.OwnerIssuer, x.OwnerSubject }).IsUnique().HasFilter("\"IsPersonal\"");
        workspace.HasMany(x => x.Members).WithOne().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        workspace.Navigation(x => x.Members).HasField("_members").UsePropertyAccessMode(PropertyAccessMode.Field);
        workspace.HasMany(x => x.Invitations).WithOne().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        workspace.Navigation(x => x.Invitations).HasField("_invitations").UsePropertyAccessMode(PropertyAccessMode.Field);
        workspace.HasMany(x => x.CustomRoles).WithOne().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        workspace.Navigation(x => x.CustomRoles).HasField("_customRoles").UsePropertyAccessMode(PropertyAccessMode.Field);
        workspace.HasMany(x => x.RoleGrants).WithOne().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        workspace.Navigation(x => x.RoleGrants).HasField("_roleGrants").UsePropertyAccessMode(PropertyAccessMode.Field);
        workspace.HasMany(x => x.Departments).WithOne().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        workspace.Navigation(x => x.Departments).HasField("_departments").UsePropertyAccessMode(PropertyAccessMode.Field);
        ConfigureCustomRoles(model);
        var account = model.Entity<UserAccount>();
        account.ToTable("user_accounts"); account.HasKey(x => x.Id); account.Property(x => x.Id).ValueGeneratedNever();
        account.Property(x => x.Issuer).HasMaxLength(500); account.Property(x => x.Subject).HasMaxLength(200);
        account.Property(x => x.VerifiedEmail).HasMaxLength(254);
        account.HasAlternateKey(x => new { x.Issuer, x.Subject });
        var member = model.Entity<WorkspaceMember>();
        member.ToTable("workspace_members"); member.HasKey(x => x.Id); member.Property(x => x.Id).ValueGeneratedNever();
        member.Property(x => x.Issuer).HasMaxLength(500); member.Property(x => x.Subject).HasMaxLength(200); member.Property(x => x.Role).HasMaxLength(80);
        member.Property(x => x.FinanceRole).HasMaxLength(30);
        member.Property(x => x.PurchaseRole).HasMaxLength(30);
        member.Property(x => x.SalesRole).HasMaxLength(30);
        // Keep existing P2 proposal rows when expanding the approval flow to procurement.
        member.Property(x => x.ProposedRole).HasColumnName("ProposedFinanceRole").HasMaxLength(30);
        member.Property(x => x.RoleProposerId).HasColumnName("FinanceRoleProposerId");
        member.Property(x => x.RoleProposalVersion).HasColumnName("FinanceRoleProposalVersion");
        member.Property(x => x.RoleProposalExpiresAtUtc).HasColumnName("FinanceRoleProposalExpiresAtUtc");
        member.HasIndex(x => new { x.WorkspaceId, x.Issuer, x.Subject }).IsUnique();
        member.HasOne<UserAccount>().WithMany().HasForeignKey(x => new { x.Issuer, x.Subject })
            .HasPrincipalKey(x => new { x.Issuer, x.Subject }).OnDelete(DeleteBehavior.Restrict);
        var invitation = model.Entity<WorkspaceInvitation>();
        invitation.ToTable("workspace_invitations"); invitation.HasKey(x => x.Id); invitation.Property(x => x.Id).ValueGeneratedNever();
        invitation.Property(x => x.Issuer).HasMaxLength(500); invitation.Property(x => x.Email).HasMaxLength(254);
        invitation.Property(x => x.Role).HasMaxLength(80); invitation.Property(x => x.TokenHash).HasMaxLength(64);
        invitation.Property(x => x.InviterIssuer).HasMaxLength(500); invitation.Property(x => x.InviterSubject).HasMaxLength(200);
        invitation.Property(x => x.AcceptedSubject).HasMaxLength(200); invitation.Property(x => x.State).HasMaxLength(20);
        invitation.HasIndex(x => new { x.WorkspaceId, x.OperationId }).IsUnique();
        var audit = model.Entity<WorkspaceAudit>();
        audit.ToTable("workspace_audit");
        audit.HasKey(x => x.Id);
        audit.Property(x => x.Action).HasMaxLength(100).IsRequired();
        audit.Property(x => x.ActorIssuer).HasMaxLength(500).IsRequired();
        audit.Property(x => x.ActorSubject).HasMaxLength(200).IsRequired();

        var subscription = model.Entity<WorkspaceSubscription>();
        subscription.ToTable("billing_subscriptions");
        subscription.HasKey(x => x.Id);
        subscription.Property(x => x.Id).ValueGeneratedNever();
        subscription.Property(x => x.Issuer).HasMaxLength(500).IsRequired();
        subscription.Property(x => x.Subject).HasMaxLength(200).IsRequired();
        subscription.Property(x => x.PlanCode).HasMaxLength(40).IsRequired();
        subscription.Property(x => x.Status).HasMaxLength(20).IsRequired();
        subscription.Property(x => x.Version).IsConcurrencyToken();
        subscription.HasIndex(x => new { x.Issuer, x.Subject }).IsUnique();

        var invoice = model.Entity<BillingInvoice>();
        invoice.ToTable("billing_invoices");
        invoice.HasKey(x => x.Id);
        invoice.Property(x => x.Id).ValueGeneratedNever();
        invoice.Property(x => x.PlanCode).HasMaxLength(40).IsRequired();
        invoice.Property(x => x.Status).HasMaxLength(20).IsRequired().IsConcurrencyToken();
        invoice.Property(x => x.Currency).HasMaxLength(3).IsRequired();
        invoice.Property(x => x.AmountCents).IsRequired();
        invoice.Property(x => x.PaymentReference).HasMaxLength(120);
        invoice.HasIndex(x => x.OperationId).IsUnique();
        invoice.HasIndex(x => x.PaymentOperationId).IsUnique().HasFilter("\"PaymentOperationId\" IS NOT NULL");
        invoice.HasIndex(x => new { x.BillingAccountId, x.IssuedAtUtc });

        var usage = model.Entity<BillingDocumentUsage>();
        usage.ToTable("billing_document_usage");
        usage.HasKey(x => new { x.BillingAccountId, x.PeriodMonth });
        usage.Property(x => x.Version).IsConcurrencyToken();

        var reservation = model.Entity<BillingUsageReservation>();
        reservation.ToTable("billing_usage_reservations");
        reservation.HasKey(x => x.OperationId);
        reservation.Property(x => x.OperationId).ValueGeneratedNever();

        var preferences = model.Entity<WorkspacePreferences>();
        preferences.ToTable("workspace_preferences");
        preferences.HasKey(x => x.WorkspaceId);
        preferences.HasOne<Workspace>().WithOne().HasForeignKey<WorkspacePreferences>(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        preferences.Property(x => x.LegalName).HasMaxLength(160);
        preferences.Property(x => x.BrandName).HasMaxLength(160);
        preferences.Property(x => x.AccentColor).HasMaxLength(7);
        preferences.Property(x => x.DateFormat).HasMaxLength(24);
        preferences.Property(x => x.TimeZone).HasMaxLength(80);
        preferences.Property(x => x.LogoDataUrl).HasMaxLength(175000);
        preferences.Property(x => x.SessionIdleMinutes).HasDefaultValue(WorkspacePreferences.DefaultSessionIdleMinutes);
        preferences.Property(x => x.RoleGrantApprovals).HasDefaultValue(WorkspacePreferences.DefaultRoleGrantApprovals);
        preferences.Property(x => x.Version).IsConcurrencyToken();

        var links = model.Entity<WorkspaceNavigationLink>();
        links.ToTable("workspace_navigation_links");
        links.HasKey(x => new { x.PersonalWorkspaceId, x.CompanyWorkspaceId });
        links.HasOne<Workspace>().WithMany().HasForeignKey(x => x.PersonalWorkspaceId).OnDelete(DeleteBehavior.Restrict);
        links.HasOne<Workspace>().WithMany().HasForeignKey(x => x.CompanyWorkspaceId).OnDelete(DeleteBehavior.Restrict);
        links.Property(x => x.Issuer).HasMaxLength(500);
        links.Property(x => x.Subject).HasMaxLength(200);
        links.Property(x => x.Version).IsConcurrencyToken();
        RecordChangeConfiguration.Configure(model);
    }

    private static void ConfigureCustomRoles(ModelBuilder model)
    {
        var role = model.Entity<WorkspaceCustomRole>();
        role.ToTable("workspace_custom_roles");
        role.Property(x => x.Id).ValueGeneratedNever();
        role.Property(x => x.Name).HasMaxLength(80);

        var grant = model.Entity<WorkspaceRoleGrant>();
        grant.ToTable("workspace_role_grants");
        grant.Property(x => x.Id).ValueGeneratedNever();
        grant.Property(x => x.Scope).HasMaxLength(16);
        grant.Property(x => x.State).HasMaxLength(16);
        grant.Property(x => x.RequiredApprovals).HasDefaultValue(WorkspacePreferences.DefaultRoleGrantApprovals);

        var department = model.Entity<WorkspaceDepartment>();
        department.ToTable("workspace_departments");
        department.Property(x => x.Id).ValueGeneratedNever();
        department.Property(x => x.Name).HasMaxLength(80);
    }
}
