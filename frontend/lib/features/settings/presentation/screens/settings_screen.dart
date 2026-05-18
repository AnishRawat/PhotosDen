import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/constants/api_constants.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../../core/theme/theme_provider.dart';
import '../../../../core/providers/currency_provider.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import '../../../home/presentation/widgets/main_web_layout.dart';

class SettingsScreen extends ConsumerStatefulWidget {
  const SettingsScreen({super.key});

  @override
  ConsumerState<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends ConsumerState<SettingsScreen> {
  String get _currency => ref.watch(currencyProvider);

  String get _themeModeString {
    final mode = ref.watch(themeProvider);
    if (mode == ThemeMode.light) return 'Light';
    if (mode == ThemeMode.dark) return 'Dark';
    return 'System';
  }

  @override
  Widget build(BuildContext context) {
    return MainWebLayout(
      selectedIndex: 5,
      onDestinationSelected: (index) {
        if (index == 0) context.go('/dashboard');
        else if (index == 1) context.go('/albums');
        else if (index == 4) context.go('/wallet');
        else if (index == 5) context.go('/settings');
        else if (index == 6) context.go('/profile');
        else if (index == 7) context.go('/library');
      },
      onLogout: () async {
        final authService = AuthService(
          cryptoService: CryptoService(),
          storageService: SecureStorageService(),
          apiBaseUrl: ApiConstants.baseUrl,
        );
        await authService.logout();
        if (context.mounted) context.go('/signup');
      },
      child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Inner Toolbar Replacement
          Padding(
            padding: const EdgeInsets.only(left: 24.0, right: 24.0, top: 16.0, bottom: 8.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Settings', style: AppTextStyles.headline.copyWith(fontSize: 24)),
              ],
            ),
          ),
          // Rest of Body
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16.0),
              children: [
                _buildSectionHeader('Appearance'),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Theme', style: AppTextStyles.bodyMedium),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: SegmentedButton<String>(
                    segments: const [
                      ButtonSegment(
                        value: 'Light',
                        icon: Icon(Icons.wb_sunny_outlined, size: 18),
                        label: Text('Light'),
                      ),
                      ButtonSegment(
                        value: 'Dark',
                        icon: Icon(Icons.nightlight_round, size: 18),
                        label: Text('Dark'),
                      ),
                      ButtonSegment(
                        value: 'System',
                        icon: Icon(Icons.settings_suggest_outlined, size: 18),
                        label: Text('System'),
                      ),
                    ],
                    selected: {_themeModeString},
                    onSelectionChanged: (Set<String> newSelection) {
                      final selection = newSelection.first;
                      ThemeMode mode = ThemeMode.system;
                      if (selection == 'Light') mode = ThemeMode.light;
                      else if (selection == 'Dark') mode = ThemeMode.dark;
                      ref.read(themeProvider.notifier).setThemeMode(mode);
                    },
                    style: SegmentedButton.styleFrom(
                      selectedForegroundColor: Colors.white,
                      selectedBackgroundColor: AppColors.primaryBlue,
                      textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                    ),
                  ),
                ),
              if (dotenv.env['ENABLE_MULTI_CURRENCY'] == 'true') ...[
                const SizedBox(height: 24),
                Text('Currency', style: AppTextStyles.bodyMedium),
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.withOpacity(0.3)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _currency,
                      isExpanded: true,
                      icon: Icon(Icons.arrow_drop_down, color: Theme.of(context).textTheme.bodySmall?.color),
                      items: const [
                        DropdownMenuItem(value: 'INR', child: Text('₹ Indian Rupee (INR)')),
                        DropdownMenuItem(value: 'USD', child: Text('\$ US Dollar (USD)')),
                        DropdownMenuItem(value: 'EUR', child: Text('€ Euro (EUR)')),
                      ],
                      onChanged: (String? newValue) {
                        if (newValue != null) {
                          ref.read(currencyProvider.notifier).setCurrency(newValue);
                        }
                      },
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
          const SizedBox(height: 24),
          _buildSectionHeader('Billing & Services'),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                _SettingsListTile(
                  icon: Icons.currency_rupee,
                  title: 'Pricing & Estimates',
                  subtitle: 'View costs for uploads, downloads, and storage',
                  onTap: () => context.push('/pricing'),
                ),
                const Divider(height: 1, indent: 56),
                _SettingsListTile(
                  icon: Icons.receipt_long_outlined,
                  title: 'Billing History',
                  subtitle: 'View your past transactions',
                  onTap: () => context.push('/wallet'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          _buildSectionHeader('About'),
          const SizedBox(height: 12),
          Container(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.04),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(
              children: [
                _SettingsListTile(
                  icon: Icons.shield_outlined,
                  title: 'Privacy Policy',
                  onTap: () {},
                ),
                const Divider(height: 1, indent: 56),
                _SettingsListTile(
                  icon: Icons.article_outlined,
                  title: 'Terms of Service',
                  onTap: () {},
                ),
              ],
            ),
          ),
        ],
      ),
    ),
    ],
    ),
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 8.0),
      child: Text(
        title.toUpperCase(),
        style: AppTextStyles.label.copyWith(
          color: Theme.of(context).textTheme.bodySmall?.color,
          letterSpacing: 1.2,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class _SettingsListTile extends StatelessWidget {
  final IconData icon;
  final String title;
  final String? subtitle;
  final VoidCallback onTap;

  const _SettingsListTile({
    required this.icon,
    required this.title,
    this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.primaryBlue.withOpacity(0.1),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: AppColors.primaryBlue, size: 24),
      ),
      title: Text(title, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w500)),
      subtitle: subtitle != null
          ? Text(subtitle!, style: AppTextStyles.label.copyWith(color: Theme.of(context).textTheme.bodySmall?.color))
          : null,
      trailing: Icon(Icons.chevron_right, color: Theme.of(context).textTheme.bodySmall?.color, size: 20),
      onTap: onTap,
    );
  }
}
