using System.Collections.Concurrent;
using System.Diagnostics.Metrics;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Hosting;

namespace Nexora.Tests;

public class ReadinessTests
{
    [Fact]
    public async Task Dependency_failure_changes_readiness_without_leaking_exception_and_records_metrics()
    {
        var measurements = new ConcurrentBag<(string Instrument, string Status, double Value)>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meter) =>
        {
            if (instrument.Meter.Name == DependencyReadiness.MeterName) meter.EnableMeasurementEvents(instrument);
        };
        void Record<T>(Instrument instrument, T value, ReadOnlySpan<KeyValuePair<string, object?>> tags) where T : IConvertible
        {
            string? name = null, status = null;
            foreach (var tag in tags)
            {
                if (tag.Key == "dependency") name = tag.Value?.ToString();
                if (tag.Key == "status") status = tag.Value?.ToString();
            }
            if (name == "test-dependency") measurements.Add((instrument.Name, status!, value.ToDouble(null)));
        }
        listener.SetMeasurementEventCallback<long>((instrument, value, tags, _) => Record(instrument, value, tags));
        listener.SetMeasurementEventCallback<double>((instrument, value, tags, _) => Record(instrument, value, tags));
        listener.Start();
        var available = true;
        var registrations = new ServiceCollection().AddLogging();
        registrations.AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"])
            .AddDependency("test-dependency", (_, _) => available ? Task.CompletedTask :
                Task.FromException(new InvalidOperationException("secret-connection-password")));
        await using var provider = registrations.BuildServiceProvider();
        var health = provider.GetRequiredService<HealthCheckService>();
        Assert.Equal(HealthStatus.Healthy, (await health.CheckHealthAsync()).Status);
        available = false;
        var failed = await health.CheckHealthAsync();
        Assert.Equal(HealthStatus.Unhealthy, failed.Status);
        Assert.Null(failed.Entries["test-dependency"].Exception);
        Assert.DoesNotContain("secret", failed.Entries["test-dependency"].Description!);
        Assert.Equal(HealthStatus.Healthy, (await health.CheckHealthAsync(r => r.Tags.Contains("live"))).Status);
        available = true;
        Assert.Equal(HealthStatus.Healthy, (await health.CheckHealthAsync()).Status);
        Assert.Contains(measurements, x => x == ("nexora.dependency.probes", "unhealthy", 1));
        Assert.Contains(measurements, x => x.Instrument == "nexora.dependency.duration" && x.Status == "healthy" && x.Value >= 0);
    }
}
