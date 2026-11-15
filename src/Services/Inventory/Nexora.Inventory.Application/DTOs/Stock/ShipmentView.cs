namespace Nexora.Inventory.Application;

public sealed record ShipmentView(Guid Id, Guid OrderId, Guid ItemId, string ItemName, string Quantity,
    string Executed, long Revision, bool Fenced, DateTimeOffset ExpiresAtUtc, bool CanShip);
