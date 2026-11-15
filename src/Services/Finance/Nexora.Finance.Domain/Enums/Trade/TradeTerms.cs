namespace Nexora.Finance.Domain;

public enum TradeKind { Bill = 1, Payment, Expense, Income, Transfer, Donation, Void, Opening, SupplierCredit, SupplierRefund }

public enum TradeState { Submitted = 1, Posted, Cancelled }
