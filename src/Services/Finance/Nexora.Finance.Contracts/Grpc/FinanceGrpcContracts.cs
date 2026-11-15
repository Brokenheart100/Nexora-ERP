using System.Runtime.Serialization;
using System.ServiceModel;
using ProtoBuf.Grpc;

namespace Nexora.Finance.Contracts.Grpc;

// Code-first gRPC surface for the Finance owner service: the accounting book terms that
// purchasing and sales need before they can post trade documents.
[ServiceContract]
public interface IFinanceGrpc
{
    Task<BookReply> GetBookAsync(BookRequest request, CallContext context = default);
}

[DataContract]
public sealed class BookRequest
{
    [DataMember(Order = 1)] public Guid WorkspaceId { get; set; }
}

[DataContract]
public sealed class BookReply
{
    [DataMember(Order = 1)] public bool IsPersonal { get; set; }
    [DataMember(Order = 2)] public bool CanInitialize { get; set; }
    [DataMember(Order = 3)] public bool HasSettings { get; set; }
    [DataMember(Order = 4)] public string? BaseCurrency { get; set; }
    [DataMember(Order = 5)] public int MinorUnits { get; set; }
    [DataMember(Order = 6)] public string? StartsOn { get; set; }
    [DataMember(Order = 7)] public int FiscalYearStartMonth { get; set; }
    [DataMember(Order = 8)] public string? Template { get; set; }
}
