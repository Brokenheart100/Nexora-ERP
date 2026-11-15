using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace Nexora.BuildingBlocks.Grpc;

public static class GrpcClientServiceCollectionExtensions
{
    // Registers a singleton code-first client; generated clients are stateless per call and the
    // channel is cached per peer by GrpcChannelFactory. A singleton lambda factory stays visible to
    // Wolverine codegen, while a scoped lambda factory would force runtime service location.
    public static IServiceCollection AddNexoraGrpcClient<TService>(this IServiceCollection services, string serviceName)
        where TService : class
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentException.ThrowIfNullOrWhiteSpace(serviceName);
        services.TryAddSingleton<GrpcChannelFactory>();
        services.AddSingleton(provider => provider.GetRequiredService<GrpcChannelFactory>().Create<TService>(serviceName));
        return services;
    }
}
