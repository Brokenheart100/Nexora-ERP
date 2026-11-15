namespace Nexora.Organization.Domain;

public sealed class PlanLimitExceededException(string resource, int limit, int used)
    : Exception($"Plan limit exceeded for {resource}: limit {limit}, used {used}.")
{
    public string Resource { get; } = resource;
    public int Limit { get; } = limit;
    public int Used { get; } = used;
}
