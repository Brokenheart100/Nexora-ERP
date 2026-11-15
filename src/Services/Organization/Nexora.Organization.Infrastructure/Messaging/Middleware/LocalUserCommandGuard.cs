using Nexora.BuildingBlocks.Application;
using Wolverine;

namespace Nexora.Organization.Infrastructure.Messaging;

public static class LocalUserCommandGuard
{
    public static void Before(Envelope envelope)
    {
        // Listener metadata is set by Wolverine itself, not trusted message headers or serialized ActorContext.
        // Queued user intents require a dedicated credential-validating adapter; accepted facts have separate contracts.
        if (envelope.Listener is not null || envelope.ReceivedAt is not null) throw new AccessDeniedException();
    }
}
