namespace Nexora.Sales.Application;

public sealed class SalesPreconditionFailedException() : Exception("No current sales order version matches If-Match. Refresh and retry.");
