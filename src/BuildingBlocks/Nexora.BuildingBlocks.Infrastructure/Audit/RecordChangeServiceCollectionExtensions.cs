using Nexora.BuildingBlocks.Application;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Nexora.BuildingBlocks.Infrastructure;

public static class RecordChangeServiceCollectionExtensions
{
    public static IServiceCollection AddRecordChanges<TContext>(this IServiceCollection services,
        IConfiguration configuration, RecordChangeInterceptor interceptor) where TContext : DbContext
    {
        services.Configure<RecordChangeOptions>(configuration.GetSection(RecordChangeOptions.SectionName));
        services.AddScoped<IRecordChangeReader, RecordChangeReader<TContext>>();
        services.AddHostedService<RecordChangeRetentionService<TContext>>();
        return services;
    }
}
