import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'device_gallery_screen.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';

/// DashboardScreen is the entry point after login.
/// It delegates all UI to [DeviceGalleryScreen] and manages navigation.
class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});

  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  int _selectedIndex = 0;
  late AuthService _authService;

  @override
  void initState() {
    super.initState();
    _initAuth();
  }

  Future<void> _initAuth() async {
    _authService = AuthService(
      cryptoService: CryptoService(),
      storageService: SecureStorageService(),
      apiBaseUrl: ApiConstants.baseUrl,
    );
    final hasSession = await _authService.loadSession();
    if (!hasSession && mounted) {
      GoRouter.of(context).go('/login');
    }
  }

  void _logout() async {
    await _authService.logout();
    if (mounted) GoRouter.of(context).go('/signup');
  }

  @override
  Widget build(BuildContext context) {
    return DeviceGalleryScreen(
      selectedIndex: _selectedIndex,
      onDestinationSelected: (index) {
        if (index == 1) {
          context.go('/albums');
        } else if (index == 4) {
          context.go('/wallet');
        } else if (index == 5) {
          context.go('/settings');
        } else if (index == 6) {
          context.go('/profile');
        } else if (index == 7) {
          context.go('/library');
        } else {
          setState(() => _selectedIndex = index);
        }
      },
      onLogout: _logout,
    );
  }
}
