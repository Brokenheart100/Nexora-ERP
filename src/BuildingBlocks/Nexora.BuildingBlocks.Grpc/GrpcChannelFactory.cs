using System.Collections.Concurrent;
using Grpc.Net.Client;
using Microsoft.Extensions.Configuration;
using ProtoBuf.Grpc.Client;

namespace Nexora.BuildingBlocks.Grpc;

// Peer addresses come from Aspire's service discovery configuration. Resolution is lazy so
// in-process test hosts that never call a peer can still start without services:* settings.
public sealed class GrpcChannelFactory(IConfiguration configuration)
{
    private readonly ConcurrentDictionary<string, GrpcChannel> _channels = new(StringComparer.Ordinal);

    public TService Create<TService>(string serviceName) where TService : class
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(serviceName);
        var channel = _channels.GetOrAdd(serviceName,
            static (name, factory) => GrpcChannel.ForAddress(factory.ResolveAddress(name)), this);
        return channel.CreateGrpcService<TService>();
    }

    public Uri ResolveAddress(string serviceName)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(serviceName);
        var address = configuration["services:" + serviceName + ":https:0"]
            ?? configuration["services:" + serviceName + ":http:0"];
        if (string.IsNullOrWhiteSpace(address))
            throw new InvalidOperationException(
                "No service discovery address is configured for '" + serviceName + "' (services:" + serviceName + ":https:0).");
        return new Uri(address, UriKind.Absolute);
    }
}
