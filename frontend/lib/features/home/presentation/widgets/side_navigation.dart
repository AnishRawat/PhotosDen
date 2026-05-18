import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../wallet/providers/wallet_provider.dart';
import 'package:intl/intl.dart';

class SideNavigation extends ConsumerWidget {
  final int selectedIndex;
  final Function(int) onDestinationSelected;
  final VoidCallback onLogout;

  const SideNavigation({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.onLogout,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final walletState = ref.watch(walletProvider);

    return Container(
      width: 250,
      color: Theme.of(context).colorScheme.surface,
      child: Column(
        children: [
          // Logo Area
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Row(
              children: [
                const Icon(Icons.camera_rounded, color: AppColors.primaryBlue, size: 28),
                const SizedBox(width: 8),
                Text('PhotosDen', style: AppTextStyles.headline.copyWith(fontSize: 20, color: Theme.of(context).textTheme.titleLarge?.color)),
              ],
            ),
          ),
          const Divider(height: 1),
          
          // Navigation Items
          Expanded(
            child: Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    children: [
                      _NavItem(
                        icon: Icons.photo_library_outlined,
                        selectedIcon: Icons.photo_library,
                        label: 'Photos',
                        isSelected: selectedIndex == 0,
                        onTap: () => onDestinationSelected(0),
                      ),
                      _NavItem(
                        icon: Icons.folder_outlined,
                        selectedIcon: Icons.folder,
                        label: 'Albums',
                        isSelected: selectedIndex == 1,
                        onTap: () => onDestinationSelected(1),
                      ),
                      _NavItem(
                        icon: Icons.cloud_outlined,
                        selectedIcon: Icons.cloud,
                        label: 'Library',
                        isSelected: selectedIndex == 7,
                        onTap: () => onDestinationSelected(7),
                      ),

                      _NavItem(
                        icon: Icons.share_outlined,
                        selectedIcon: Icons.share,
                        label: 'Sharing',
                        isSelected: selectedIndex == 2,
                        onTap: () => onDestinationSelected(2),
                      ),
                      const Divider(height: 32, indent: 16, endIndent: 16),
                      _NavItem(
                        icon: Icons.delete_outline,
                        selectedIcon: Icons.delete,
                        label: 'Trash',
                        isSelected: selectedIndex == 3,
                        onTap: () => onDestinationSelected(3),
                      ),
                      _NavItem(
                        icon: Icons.settings_outlined,
                        selectedIcon: Icons.settings,
                        label: 'Settings',
                        isSelected: selectedIndex == 5,
                        onTap: () => onDestinationSelected(5),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          
          // User Profile (Bottom)
          Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () => onDestinationSelected(6), // 6 = Profile
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
                ),
                child: Row(
                  children: [
                    const CircleAvatar(
                      backgroundColor: AppColors.primaryBlue,
                      radius: 16,
                      child: Text('A', style: TextStyle(color: Colors.white, fontSize: 14)),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Anish Rawat', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600, fontSize: 13, color: Theme.of(context).textTheme.bodyLarge?.color)),
                          const SizedBox(height: 2),
                          // Wallet Balance
                          GestureDetector(
                            onTap: () => onDestinationSelected(4), // 4 = Wallet screen override
                            child: walletState.when(
                              data: (state) {
                                if (state.balance != null) {
                                  final formatCurrency = NumberFormat.currency(locale: 'en_IN', symbol: state.balance!.currencySymbol);
                                  return Row(
                                    children: [
                                      const Icon(Icons.account_balance_wallet, size: 12, color: AppColors.primaryBlue),
                                      const SizedBox(width: 4),
                                      Text(
                                        formatCurrency.format(state.balance!.balanceAvailable),
                                        style: AppTextStyles.label.copyWith(color: AppColors.primaryBlue, fontWeight: FontWeight.bold),
                                      ),
                                    ],
                                  );
                                }
                                return Text('Wallet Error', style: AppTextStyles.label.copyWith(color: Colors.redAccent));
                              },
                              loading: () => const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2)),
                              error: (_, __) => Text('Wallet Error', style: AppTextStyles.label.copyWith(color: Colors.redAccent)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.logout_rounded, size: 20, color: Colors.redAccent),
                      onPressed: onLogout,
                      tooltip: 'Sign Out',
                      padding: EdgeInsets.zero,
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool isSelected;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.isSelected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Material(
        color: isSelected ? AppColors.primaryBlue.withOpacity(0.1) : Colors.transparent,
        borderRadius: BorderRadius.circular(8),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              children: [
                Icon(
                  isSelected ? selectedIcon : icon,
                  size: 20,
                  color: isSelected ? AppColors.primaryBlue : Theme.of(context).iconTheme.color,
                ),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: AppTextStyles.bodyMedium.copyWith(
                    color: isSelected ? AppColors.primaryBlue : Theme.of(context).textTheme.bodyMedium?.color,
                    fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
