namespace Nexora.Finance.Domain;

public enum DispatchState { Queued = 1, Sending, Sent, Failed, Unknown, Abandoned }
