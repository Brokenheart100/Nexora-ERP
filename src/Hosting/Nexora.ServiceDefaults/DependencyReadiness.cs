using System.Diagnostics;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using RabbitMQ.Client;

namespace Microsoft.Extensions.Hosting;

public static class DependencyReadiness
{
    public const string MeterName = "Nexora.Platform";
    private static readonly Meter Meter = new(MeterName);
    private static readonly Counter<long> Probes = Meter.CreateCounter<long>("nexora.dependency.probes", "{probe}");
    private static readonly Histogram<double> Duration = Meter.CreateHistogram<double>("nexora.dependency.duration", "s");

    public static IHealthChecksBuilder AddDependency(this IHealthChecksBuilder checks, string name,
        Func<IServiceProvider, CancellationToken, Task> probe) => checks.Add(new HealthCheckRegistration(
            name, services => new Probe(services, name, probe), HealthStatus.Unhealthy, ["ready"], TimeSpan.FromSeconds(4)));

    public static IHealthChecksBuilder AddRabbitReadiness(this IHealthChecksBuilder checks, string connectionString) =>
        checks.AddDependency("rabbitmq", async (_, cancellation) =>
        {
            // Authenticate with this application's own credentials; do not create or consume queues.
            var factory = new ConnectionFactory
            {
                Uri = new Uri(connectionString),
                AutomaticRecoveryEnabled = false,
                RequestedConnectionTimeout = TimeSpan.FromSeconds(2),
                ClientProvidedName = "nexora-readiness"
            };
            await using var connection = await factory.CreateConnectionAsync(cancellation);
            await using var channel = await connection.CreateChannelAsync(cancellationToken: cancellation);
            if (!channel.IsOpen) throw new InvalidOperationException("Broker channel unavailable.");
        });

    public static IHealthChecksBuilder AddHttpReadiness(this IHealthChecksBuilder checks, string name, Uri address) =>
        checks.AddDependency(name, async (services, cancellation) =>
        {
            using var response = await services.GetRequiredService<IHttpClientFactory>().CreateClient("readiness")
                .GetAsync(address, HttpCompletionOption.ResponseHeadersRead, cancellation);
            response.EnsureSuccessStatusCode();
        });

    private sealed class Probe(IServiceProvider services, string name,
        Func<IServiceProvider, CancellationToken, Task> probe) : IHealthCheck
    {
        public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        {
            var started = Stopwatch.GetTimestamp();
            var healthy = false;
            try
            {
                await probe(services, cancellationToken);
                healthy = true;
                return HealthCheckResult.Healthy();
            }
            catch (Exception)
            {
                // Connection exceptions can include addresses or usernames. Operational endpoints/logs need only status.
                return HealthCheckResult.Unhealthy("Dependency unavailable.");
            }
            finally
            {
                var tags = new TagList { { "dependency", name }, { "status", healthy ? "healthy" : "unhealthy" } };
                Probes.Add(1, tags);
                Duration.Record(Stopwatch.GetElapsedTime(started).TotalSeconds, tags);
            }
        }
    }
}
