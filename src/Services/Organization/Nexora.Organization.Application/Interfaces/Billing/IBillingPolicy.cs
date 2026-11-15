using Nexora.Organization.Domain;

namespace Nexora.Organization.Application;

public interface IBillingPolicy
{
    BillingPlan DefaultPlan { get; }
}
