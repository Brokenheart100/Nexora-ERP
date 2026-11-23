using Microsoft.EntityFrameworkCore;
using Nexora.BuildingBlocks.Infrastructure;

namespace Nexora.Tests;

public sealed class RecordChangeCaptureTests
{
    [Fact]
    public void Credentials_are_omitted_before_a_snapshot_is_persisted()
    {
        using var db = new SnapshotContext();
        var row = new SnapshotRow(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), "original", "synthetic-first");
        db.Attach(row);
        db.Entry(row).Property(x => x.Name).CurrentValue = "updated";
        db.Entry(row).Property(x => x.TokenHash).CurrentValue = "synthetic-second";
        var change = Assert.Single(RecordChangeCapture.Capture(db, "finance", null, DateTimeOffset.UtcNow));
        Assert.Equal("Name", change.ChangedProperties);
        Assert.Contains("original", change.BeforeJson!);
        Assert.Contains("updated", change.AfterJson!);
        Assert.DoesNotContain("TokenHash", change.BeforeJson!);
        Assert.DoesNotContain("TokenHash", change.AfterJson!);
    }

    private sealed class SnapshotContext : DbContext
    {
        protected override void OnConfiguring(DbContextOptionsBuilder options) => options.UseNpgsql("Host=localhost;Database=record_change_model");
        protected override void OnModelCreating(ModelBuilder model) => model.Entity<SnapshotRow>().HasKey(x => x.Id);
    }

    private sealed class SnapshotRow(Guid id, Guid tenantId, Guid workspaceId, string name, string tokenHash)
    {
        public Guid Id { get; private set; } = id;
        public Guid TenantId { get; private set; } = tenantId;
        public Guid WorkspaceId { get; private set; } = workspaceId;
        public string Name { get; private set; } = name;
        public string TokenHash { get; private set; } = tokenHash;
    }
}
