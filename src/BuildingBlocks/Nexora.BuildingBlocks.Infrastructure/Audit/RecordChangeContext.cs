using Nexora.BuildingBlocks.Application;
namespace Nexora.BuildingBlocks.Infrastructure;

// The ambient actor is set by HTTP middleware so interceptors never depend on ASP.NET types.
public static class RecordChangeContext
{
    private static readonly AsyncLocal<ActorContext?> Ambient = new();

    public static ActorContext? Actor
    {
        get => Ambient.Value;
        set => Ambient.Value = value;
    }
}
