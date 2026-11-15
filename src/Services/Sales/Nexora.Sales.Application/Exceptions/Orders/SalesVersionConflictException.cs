namespace Nexora.Sales.Application;

public sealed class SalesVersionConflictException() : Exception("The sales order version changed. Refresh and retry.");
