import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../data/models/wallet_model.dart';
import '../../../../core/services/wallet_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/constants/api_constants.dart';


// Service Provider
final walletServiceProvider = Provider<WalletService>((ref) {
  // To avoid circular dependency or complex setup, we create a fresh one or grab an existing authService that is globally available. 
  // Ideally, authService is provided via a provider. For now we instantiate the dependencies.
  final storageService = SecureStorageService();
  final cryptoService = CryptoService();
  final authService = AuthService(
    storageService: storageService,
    cryptoService: cryptoService,
    apiBaseUrl: ApiConstants.baseUrl,
  );

  return WalletService(
    storageService: storageService,
    authService: authService,
  );
});

// State classes
class WalletState {
  final WalletModel? balance;
  final List<DepositModel> deposits;
  final bool isLoading;
  final String? error;

  WalletState({
    this.balance,
    this.deposits = const [],
    this.isLoading = false,
    this.error,
  });

  WalletState copyWith({
    WalletModel? balance,
    List<DepositModel>? deposits,
    bool? isLoading,
    String? error,
  }) {
    return WalletState(
      balance: balance ?? this.balance,
      deposits: deposits ?? this.deposits,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

// Notifier
class WalletNotifier extends AsyncNotifier<WalletState> {

  @override
  Future<WalletState> build() async {
    return _loadData();
  }

  Future<WalletState> _loadData() async {
    final walletService = ref.read(walletServiceProvider);
    try {
      final responses = await Future.wait([
        walletService.getWalletBalance(),
        walletService.getDepositHistory().catchError((e) => <DepositModel>[]),
      ]);

      return WalletState(
        balance: responses[0] as WalletModel,
        deposits: responses[1] as List<DepositModel>,
        isLoading: false,
      );
    } catch (e) {
      return WalletState(
        error: e.toString(),
        isLoading: false,
      );
    }
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() => _loadData());
  }

  Future<void> addFunds(double amount, {String? notes}) async {
    final walletService = ref.read(walletServiceProvider);
    
    // Optimistic Update
    final currentState = state.value ?? WalletState();
    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';
    final tempDeposit = DepositModel(
      depositId: tempId,
      amount: amount,
      status: 'PROCESSING',
      createdAt: DateTime.now().millisecondsSinceEpoch,
      notes: notes,
    );
      
    state = AsyncValue.data(currentState.copyWith(
      deposits: [tempDeposit, ...currentState.deposits],
    ));

    try {
      await walletService.createDeposit(amount, notes: notes);
      // Refresh to get real data
      await refresh();
    } catch (e) {
      // Revert optimism if failed
      state = AsyncValue.data(currentState.copyWith(
        deposits: currentState.deposits.where((d) => !d.depositId.startsWith('temp_')).toList(),
        error: 'Deposit Failed: ${e.toString()}',
      ));
    }
  }
}

final walletProvider = AsyncNotifierProvider<WalletNotifier, WalletState>(() {
  return WalletNotifier();
});
