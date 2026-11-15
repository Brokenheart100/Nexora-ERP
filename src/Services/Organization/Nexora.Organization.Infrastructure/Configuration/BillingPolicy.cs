using Microsoft.Extensions.Options;
using Nexora.Organization.Application;
using Nexora.Organization.Domain;

namespace Nexora.Organization.Infrastructure;

public sealed class BillingOptions
{
    public string DefaultPlan { get; set; } = BillingPlans.Free;
}

public sealed class BillingPolicy(IOptions<BillingOptions> options) : IBillingPolicy
{
    public BillingPlan DefaultPlan { get; } = BillingPlans.Find(options.Value.DefaultPlan) ?? BillingPlans.FreePlan;
}
