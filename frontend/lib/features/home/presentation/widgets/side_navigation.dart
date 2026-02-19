import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';

class SideNavigation extends StatelessWidget {
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
  Widget build(BuildContext context) {
    return Container(
      width: 250,
      color: AppColors.surface,
      child: Column(
        children: [
          // Logo Area
          Padding(
            padding: const EdgeInsets.all(24.0),
            child: Row(
              children: [
                const Icon(Icons.camera_rounded, color: AppColors.primaryBlue, size: 28),
                const SizedBox(width: 8),
                Text('PhotosDen', style: AppTextStyles.headline.copyWith(fontSize: 20)),
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
                        icon: Icons.favorite_border,
                        selectedIcon: Icons.favorite,
                        label: 'Favorites',
                        isSelected: selectedIndex == 2,
                        onTap: () => onDestinationSelected(2),
                      ),
                      _NavItem(
                        icon: Icons.share_outlined,
                        selectedIcon: Icons.share,
                        label: 'Sharing',
                        isSelected: selectedIndex == 3,
                        onTap: () => onDestinationSelected(3),
                      ),
                      const Divider(height: 32, indent: 16, endIndent: 16),
                      _NavItem(
                        icon: Icons.delete_outline,
                        selectedIcon: Icons.delete,
                        label: 'Trash',
                        isSelected: selectedIndex == 4,
                        onTap: () => onDestinationSelected(4),
                      ),
                    ],
                  ),
                ),
                // Logout at the bottom of the navigation area
                Padding(
                  padding: const EdgeInsets.only(bottom: 16.0),
                  child: _NavItem(
                    icon: Icons.logout_rounded,
                    selectedIcon: Icons.logout_rounded,
                    label: 'Sign Out',
                    isSelected: false,
                    onTap: onLogout,
                  ),
                ),
              ],
            ),
          ),
          
          // User Profile (Bottom)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: Colors.grey.shade200)),
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
                      Text('Anish Rawat', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                      Text('Pro Plan', style: AppTextStyles.label.copyWith(color: AppColors.textSlate)),
                    ],
                  ),
                ),
                const Icon(Icons.settings_outlined, size: 20, color: AppColors.textSlate),
              ],
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
                  color: isSelected ? AppColors.primaryBlue : AppColors.textSlate,
                ),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: AppTextStyles.bodyMedium.copyWith(
                    color: isSelected ? AppColors.primaryBlue : AppColors.textDark,
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
