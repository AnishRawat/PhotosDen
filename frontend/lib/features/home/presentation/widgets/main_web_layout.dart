import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import 'side_navigation.dart';

class MainWebLayout extends StatefulWidget {
  final Widget child;
  final int selectedIndex;
  final Function(int) onDestinationSelected;
  final VoidCallback onLogout;

  const MainWebLayout({
    super.key,
    required this.child,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.onLogout,
  });

  @override
  State<MainWebLayout> createState() => _MainWebLayoutState();
}

class _MainWebLayoutState extends State<MainWebLayout> {
  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final isDesktop = constraints.maxWidth > 800;

        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: _buildAppBar(isDesktop),
          drawer: isDesktop
              ? null
              : Drawer(
                  child: SideNavigation(
                    selectedIndex: widget.selectedIndex,
                    onDestinationSelected: (index) {
                      Navigator.pop(context); // Close drawer
                      widget.onDestinationSelected(index);
                    },
                    onLogout: widget.onLogout,
                  ),
                ),
          body: Row(
            children: [
              if (isDesktop)
                SideNavigation(
                  selectedIndex: widget.selectedIndex,
                  onDestinationSelected: widget.onDestinationSelected,
                  onLogout: widget.onLogout,
                ),
              Expanded(
                child: widget.child,
              ),
            ],
          ),
        );
      },
    );
  }

  PreferredSizeWidget _buildAppBar(bool isDesktop) {
    return AppBar(
      backgroundColor: AppColors.surface,
      elevation: 0,
      iconTheme: const IconThemeData(color: AppColors.textDark),
      title: isDesktop
          ? null // Title is in sidebar for desktop
          : Row(
              children: [
                const Icon(Icons.camera_rounded, color: AppColors.primaryBlue),
                const SizedBox(width: 8),
                Text('PhotosDen', style: AppTextStyles.headline.copyWith(fontSize: 20)),
              ],
            ),
      actions: [
        // Search Bar (Only on Desktop to save space on Mobile)
        if (isDesktop)
          Container(
            width: 200,
            margin: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: Colors.grey.shade100,
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                const Icon(Icons.search, size: 20, color: AppColors.textSlate),
                const SizedBox(width: 8),
                Text('Search...', style: AppTextStyles.bodyMedium.copyWith(color: AppColors.textSlate)),
              ],
            ),
          )
        else
          IconButton(
            icon: const Icon(Icons.search, color: AppColors.textSlate),
            onPressed: () {},
          ),
        const SizedBox(width: 16),
        IconButton(
          icon: const Icon(Icons.notifications_none_rounded),
          onPressed: () {},
        ),
        const SizedBox(width: 16),
      ],
    );
  }
}
