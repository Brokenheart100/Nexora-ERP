using Nexora.Organization.Contracts.Grpc;

namespace Nexora.Tests;

public sealed class ScopedPermissionWireTests
{
    [Fact]
    public void Scoped_permission_dates_survive_the_code_first_wire_contract()
    {
        var reply = new WorkspaceAccessReply
        {
            WorkspaceId = Guid.NewGuid(),
            ScopedPermissions =
            [
                new ScopedPermissionData
                {
                    Permission = "finance.ledger.read",
                    StartsOn = "2026-01-01",
                    EndsOn = "2026-12-31",
                },
            ],
        };
        using var stream = new MemoryStream();
        ProtoBuf.Serializer.Serialize(stream, reply);
        stream.Position = 0;
        var restored = ProtoBuf.Serializer.Deserialize<WorkspaceAccessReply>(stream);
        var permission = Assert.Single(restored.ScopedPermissions);
        Assert.Equal("2026-01-01", permission.StartsOn);
        Assert.Equal("2026-12-31", permission.EndsOn);
    }
}
