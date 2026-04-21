import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../providers/wallet_provider.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../home/presentation/widgets/main_web_layout.dart';

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final walletState = ref.watch(walletProvider);

    return MainWebLayout(
      selectedIndex: 4,
      onDestinationSelected: (index) {
        if (index == 0) context.go('/dashboard');
        else if (index == 1) context.go('/albums');
        else if (index == 4) context.go('/wallet');
        else if (index == 5) context.go('/settings');
        else if (index == 6) context.go('/profile');
      },
      onLogout: () async {
        final authService = AuthService(
          cryptoService: CryptoService(),
          storageService: SecureStorageService(),
          apiBaseUrl: ApiConstants.baseUrl,
        );
        await authService.logout();
        if (context.mounted) context.go('/login');
      },
      child: Scaffold(
        backgroundColor: AppColors.background,
        body: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Inner Toolbar Replacement
            Padding(
              padding: const EdgeInsets.only(left: 24.0, right: 24.0, top: 16.0),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Wallet', style: AppTextStyles.headline.copyWith(fontSize: 24)),
                  IconButton(
                    icon: const Icon(Icons.refresh_rounded, color: AppColors.textDark),
                    onPressed: () => ref.read(walletProvider.notifier).refresh(),
                    tooltip: 'Refresh',
                  ),
                ],
              ),
            ),
            // Rest of Body
            Expanded(
              child: walletState.when(
                data: (state) {
                  if (state.error != null) {
                    return _buildErrorState(context, ref, state.error!);
                  }
                  return _buildContent(context, ref, state);
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, st) => _buildErrorState(context, ref, e.toString()),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(BuildContext context, WidgetRef ref, String error) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 60, color: Colors.redAccent),
            const SizedBox(height: 16),
            Text('Error Loading Wallet', style: AppTextStyles.headline.copyWith(fontSize: 20)),
            const SizedBox(height: 8),
            Text(error, textAlign: TextAlign.center, style: AppTextStyles.bodyMedium),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => ref.read(walletProvider.notifier).refresh(),
              icon: const Icon(Icons.refresh),
              label: const Text('Retry'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(BuildContext context, WidgetRef ref, WalletState state) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Mobile view - stack vertically
        if (constraints.maxWidth < 800) {
          return RefreshIndicator(
            onRefresh: () => ref.read(walletProvider.notifier).refresh(),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24.0),
              physics: const AlwaysScrollableScrollPhysics(),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _WalletSummaryCards(state: state),
                  const SizedBox(height: 32),
                  _DepositHistoryList(state: state),
                ],
              ),
            ),
          );
        }

        // Desktop/Tablet view - split horizontally
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Left Pane: Balances
            Expanded(
              flex: 5,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(32.0),
                child: _WalletSummaryCards(state: state),
              ),
            ),
            
            // Divider
            Container(width: 1, color: Colors.grey.withOpacity(0.2)),

            // Right Pane: History
            Expanded(
              flex: 7,
              child: Container(
                color: Colors.white,
                child: _DepositHistoryList(state: state),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _WalletSummaryCards extends ConsumerWidget {
  final WalletState state;

  const _WalletSummaryCards({required this.state});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.balance == null) {
      return const SizedBox.shrink();
    }
    final balance = state.balance!;
    final formatCurrency = NumberFormat.currency(locale: 'en_IN', symbol: balance.currencySymbol);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Main Available Balance Card
        Container(
          padding: const EdgeInsets.all(28.0),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AppColors.primaryBlue, Color(0xFF1E3A8A)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: AppColors.primaryBlue.withOpacity(0.3),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Available Balance', style: AppTextStyles.bodyMedium.copyWith(color: Colors.white70)),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: balance.accountStatus == 'ACTIVE' ? Colors.greenAccent.withOpacity(0.2) : Colors.redAccent.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      balance.accountStatus,
                      style: AppTextStyles.label.copyWith(
                        color: balance.accountStatus == 'ACTIVE' ? Colors.greenAccent : Colors.redAccent,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                formatCurrency.format(balance.balanceAvailable),
                style: AppTextStyles.headline.copyWith(color: Colors.white, fontSize: 42, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 24),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => _showAddFundsModal(context, ref),
                  icon: const Icon(Icons.add_circle_outline, color: AppColors.primaryBlue),
                  label: Text('Add Funds', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold, color: AppColors.primaryBlue)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 24),

        // Breakdowns
        Row(
          children: [
            Expanded(
              child: _BreakdownCard(
                title: 'Total Balance',
                amount: formatCurrency.format(balance.balanceTotal),
                icon: Icons.account_balance_wallet_outlined,
                color: Colors.blueGrey,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: _BreakdownCard(
                title: 'Reserved',
                amount: formatCurrency.format(balance.balanceReserved),
                icon: Icons.lock_outline_rounded,
                color: Colors.orange,
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _showAddFundsModal(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _AddFundsModal(
        onSubmit: (amount) {
          ref.read(walletProvider.notifier).addFunds(amount);
          Navigator.pop(context);
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Processing deposit of ₹$amount')));
        },
      ),
    );
  }
}

class _BreakdownCard extends StatelessWidget {
  final String title;
  final String amount;
  final IconData icon;
  final Color color;

  const _BreakdownCard({
    required this.title,
    required this.amount,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.withOpacity(0.1)),
        boxShadow: [
           BoxShadow(
            color: Colors.black.withOpacity(0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 28),
          const SizedBox(height: 12),
          Text(title, style: AppTextStyles.label.copyWith(color: AppColors.textSlate)),
          const SizedBox(height: 4),
          Text(amount, style: AppTextStyles.headline.copyWith(fontSize: 20)),
        ],
      ),
    );
  }
}

class _DepositHistoryList extends StatelessWidget {
  final WalletState state;

  const _DepositHistoryList({required this.state});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Deposit History', style: AppTextStyles.headline.copyWith(fontSize: 22)),
              if (state.deposits.isNotEmpty)
                Text('${state.deposits.length} Records', style: AppTextStyles.label.copyWith(color: AppColors.textSlate)),
            ],
          ),
          const SizedBox(height: 24),
          if (state.deposits.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.all(40.0),
                child: Column(
                  children: [
                    Icon(Icons.history_rounded, size: 64, color: Colors.grey.withOpacity(0.3)),
                    const SizedBox(height: 16),
                    Text('No previous deposits found', style: AppTextStyles.bodyMedium.copyWith(color: AppColors.textSlate)),
                  ],
                ),
              ),
            )
          else
            ListView.separated(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: state.deposits.length,
              separatorBuilder: (context, index) => const Divider(height: 1, indent: 64),
              itemBuilder: (context, index) {
                final deposit = state.deposits[index];
                final isPending = deposit.status == 'PENDING' || deposit.status == 'PROCESSING';
                final isFailed = deposit.status == 'FAILED';
                
                final formatCurrency = NumberFormat.currency(locale: 'en_IN', symbol: '₹');
                final dateStr = DateFormat('MMM d, y, h:mm a').format(DateTime.fromMillisecondsSinceEpoch(deposit.createdAt));

                return ListTile(
                  contentPadding: const EdgeInsets.symmetric(vertical: 8),
                  leading: CircleAvatar(
                    backgroundColor: isFailed ? Colors.redAccent.withOpacity(0.1) : 
                                    isPending ? Colors.orange.withOpacity(0.1) : Colors.green.withOpacity(0.1),
                    child: Icon(
                      isFailed ? Icons.error_outline :
                      isPending ? Icons.pending_outlined : Icons.check_circle_outline,
                      color: isFailed ? Colors.redAccent : 
                             isPending ? Colors.orange : Colors.green,
                    ),
                  ),
                  title: Text(
                    formatCurrency.format(deposit.amount),
                    style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text(dateStr, style: AppTextStyles.label),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: isFailed ? Colors.redAccent.withOpacity(0.1) : 
                            isPending ? Colors.orange.withOpacity(0.1) : Colors.green.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      deposit.status,
                      style: AppTextStyles.label.copyWith(
                        color: isFailed ? Colors.redAccent : 
                             isPending ? Colors.orange : Colors.green,
                        fontWeight: FontWeight.bold,
                        fontSize: 10
                      ),
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

class _AddFundsModal extends StatefulWidget {
  final Function(double) onSubmit;

  const _AddFundsModal({required this.onSubmit});

  @override
  State<_AddFundsModal> createState() => _AddFundsModalState();
}

class _AddFundsModalState extends State<_AddFundsModal> {
  final TextEditingController _amountController = TextEditingController();
  final List<double> _quickAmounts = [100, 500, 1000];

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom + 24,
        top: 24,
        left: 24,
        right: 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
               Text('Add Funds', style: AppTextStyles.headline.copyWith(fontSize: 20)),
               IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
            ],
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            style: AppTextStyles.headline.copyWith(fontSize: 32),
            decoration: InputDecoration(
              prefixText: '₹ ',
              prefixStyle: AppTextStyles.headline.copyWith(fontSize: 32, color: AppColors.textSlate),
              labelText: 'Enter Amount',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onChanged: (val) => setState(() {}),
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            children: _quickAmounts.map((amt) {
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4.0),
                  child: OutlinedButton(
                    onPressed: () {
                      _amountController.text = amt.toStringAsFixed(0);
                      setState((){});
                    },
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      side: BorderSide(color: AppColors.primaryBlue.withOpacity(0.5)),
                    ),
                    child: Text('₹${amt.toStringAsFixed(0)}', style: AppTextStyles.bodyMedium.copyWith(color: AppColors.primaryBlue)),
                  ),
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 32),
          ElevatedButton(
            onPressed: () {
              final amount = double.tryParse(_amountController.text);
              if (amount != null && amount > 0) {
                widget.onSubmit(amount);
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryBlue,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              disabledBackgroundColor: Colors.grey.shade300,
            ),
            child: const Text('Confirm Deposit', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
