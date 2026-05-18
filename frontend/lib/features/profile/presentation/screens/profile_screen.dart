import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../auth/presentation/providers/auth_provider.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../home/presentation/widgets/main_web_layout.dart';

class ProfileScreen extends ConsumerWidget {
  final VoidCallback onLogout;

  const ProfileScreen({super.key, required this.onLogout});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authProvider);
    final user = authState.user;

    return MainWebLayout(
      selectedIndex: 6,
      onDestinationSelected: (index) {
        if (index == 0) context.go('/dashboard');
        else if (index == 1) context.go('/albums');
        else if (index == 4) context.go('/wallet');
        else if (index == 5) context.go('/settings');
        else if (index == 6) context.go('/profile');
        else if (index == 7) context.go('/library');
      },
      onLogout: onLogout,
      child: Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Inner Toolbar Replacement
          Padding(
            padding: const EdgeInsets.only(left: 24.0, right: 24.0, top: 16.0),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Profile', style: AppTextStyles.headline.copyWith(fontSize: 24)),
              ],
            ),
          ),
          // Rest of Body
          Expanded(
            child: SingleChildScrollView(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [
              // Profile Picture
              Stack(
                alignment: Alignment.bottomRight,
                children: [
                  CircleAvatar(
                    radius: 60,
                    backgroundColor: AppColors.primaryBlue.withOpacity(0.1),
                    child: const Text('AR', style: TextStyle(fontSize: 48, color: AppColors.primaryBlue, fontWeight: FontWeight.bold)),
                  ),
                  Container(
                    margin: const EdgeInsets.all(4),
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: AppColors.primaryBlue,
                      shape: BoxShape.circle,
                      border: Border.all(color: Theme.of(context).colorScheme.surface, width: 3),
                    ),
                    child: const Icon(Icons.camera_alt, color: Colors.white, size: 20),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Name section
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
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
                    Text('Personal Information', style: AppTextStyles.label.copyWith(color: Theme.of(context).textTheme.bodySmall?.color, letterSpacing: 1.2, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 16),
                    _ProfileField(
                      label: 'Full Name', 
                      value: user?.name ?? 'Unknown User',
                      onEdit: () {
                        showDialog(
                          context: context,
                          builder: (ctx) {
                            final controller = TextEditingController(text: user?.name ?? '');
                            return AlertDialog(
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                              title: Text('Edit Name', style: AppTextStyles.headline.copyWith(fontSize: 18)),
                              content: TextField(
                                controller: controller,
                                decoration: InputDecoration(
                                  labelText: 'Full Name',
                                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                              ),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(ctx),
                                  child: Text('Cancel', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
                                ),
                                ElevatedButton(
                                  onPressed: () {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      const SnackBar(content: Text('Name update saved! (Stub)')),
                                    );
                                    Navigator.pop(ctx);
                                  },
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.primaryBlue,
                                    foregroundColor: Colors.white,
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                  ),
                                  child: const Text('Save'),
                                ),
                              ],
                            );
                          },
                        );
                      },
                    ),
                    const Divider(height: 32),
                    _ProfileField(
                      label: 'Email', 
                      value: user?.email ?? 'Unknown Email',
                      showEditIcon: false,
                    ),
                    const Divider(height: 32),
                    if (user?.phoneNumber == null || user!.phoneNumber!.isEmpty)
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('Phone number', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color, fontSize: 13)),
                              const SizedBox(height: 4),
                              Text('Not linked', style: AppTextStyles.bodyMedium.copyWith(color: Theme.of(context).textTheme.bodySmall?.color, fontStyle: FontStyle.italic)),
                            ],
                          ),
                          TextButton.icon(
                            onPressed: () {
                              showDialog(
                                context: context,
                                builder: (ctx) {
                                  final controller = TextEditingController();
                                  return AlertDialog(
                                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                    title: Text('Add Phone Number', style: AppTextStyles.headline.copyWith(fontSize: 18)),
                                    content: TextField(
                                      controller: controller,
                                      keyboardType: TextInputType.phone,
                                      decoration: InputDecoration(
                                        labelText: 'Phone Number',
                                        prefixText: '+91 ',
                                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                                      ),
                                    ),
                                    actions: [
                                      TextButton(
                                        onPressed: () => Navigator.pop(ctx),
                                        child: Text('Cancel', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color)),
                                      ),
                                      ElevatedButton(
                                        onPressed: () {
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            const SnackBar(content: Text('Verification sent! (Stub)')),
                                          );
                                          Navigator.pop(ctx);
                                        },
                                        style: ElevatedButton.styleFrom(
                                          backgroundColor: AppColors.primaryBlue,
                                          foregroundColor: Colors.white,
                                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                                        ),
                                        child: const Text('Save'),
                                      ),
                                    ],
                                  );
                                },
                              );
                            },
                            icon: const Icon(Icons.add, size: 18),
                            label: const Text('Add Phone Number'),
                            style: TextButton.styleFrom(
                              foregroundColor: AppColors.primaryBlue,
                            ),
                          ),
                        ],
                      )
                    else
                      _ProfileField(label: 'Phone number', value: user.phoneNumber!),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Security section
              Container(
                width: double.infinity,
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
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                      title: Text('Change Password', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w500)),
                      trailing: Icon(Icons.chevron_right, color: Theme.of(context).textTheme.bodySmall?.color),
                      onTap: () {},
                    ),
                    const Divider(height: 1, indent: 20, endIndent: 20),
                    ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                      title: Text('Two-Factor Authentication', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w500)),
                      trailing: Icon(Icons.chevron_right, color: Theme.of(context).textTheme.bodySmall?.color),
                      onTap: () {},
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 48),

              // Sign Out Button
              SizedBox(
                width: double.infinity,
                height: 54,
                child: OutlinedButton.icon(
                  onPressed: onLogout,
                  icon: const Icon(Icons.logout, color: Colors.redAccent),
                  label: const Text('Sign Out', style: TextStyle(color: Colors.redAccent, fontSize: 16, fontWeight: FontWeight.bold)),
                  style: OutlinedButton.styleFrom(
                    side: BorderSide(color: Colors.redAccent.withOpacity(0.5)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ),
    ],
    ),
      ),
    );
  }
}

class _ProfileField extends StatelessWidget {
  final String label;
  final String value;
  final bool showEditIcon;
  final VoidCallback? onEdit;

  const _ProfileField({
    required this.label, 
    required this.value,
    this.showEditIcon = true,
    this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color, fontSize: 13)),
            const SizedBox(height: 4),
            Text(value, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w500)),
          ],
        ),
        if (showEditIcon)
          IconButton(
            icon: Icon(Icons.edit_outlined, color: AppColors.primaryBlue.withOpacity(0.6), size: 20),
            onPressed: onEdit,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
      ],
    );
  }
}
