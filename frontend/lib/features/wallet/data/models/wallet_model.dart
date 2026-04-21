class WalletModel {
  final String userId;
  final double balanceTotal;
  final double balanceReserved;
  final double balanceOwed;
  final double balanceAvailable;
  final String currency;
  final String currencySymbol;
  final String accountStatus;

  WalletModel({
    required this.userId,
    required this.balanceTotal,
    required this.balanceReserved,
    required this.balanceOwed,
    required this.balanceAvailable,
    required this.currency,
    required this.currencySymbol,
    required this.accountStatus,
  });

  factory WalletModel.fromJson(Map<String, dynamic> json) {
    return WalletModel(
      userId: json['userId'] as String,
      balanceTotal: (json['balanceTotal'] as num).toDouble(),
      balanceReserved: (json['balanceReserved'] as num).toDouble(),
      balanceOwed: (json['balanceOwed'] as num).toDouble(),
      balanceAvailable: (json['balanceAvailable'] as num).toDouble(),
      currency: json['currency'] as String? ?? 'INR',
      currencySymbol: json['currencySymbol'] as String? ?? '₹',
      accountStatus: json['accountStatus'] as String? ?? 'ACTIVE',
    );
  }
}

class DepositModel {
  final String depositId;
  final double amount;
  final String status;
  final int createdAt;
  final String? notes;

  DepositModel({
    required this.depositId,
    required this.amount,
    required this.status,
    required this.createdAt,
    this.notes,
  });

  factory DepositModel.fromJson(Map<String, dynamic> json) {
    return DepositModel(
      depositId: json['depositId'] as String,
      amount: (json['amount'] as num).toDouble(),
      status: json['status'] as String,
      createdAt: json['createdAt'] as int,
      notes: json['notes'] as String?,
    );
  }
}
