import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../features/landing/presentation/screens/landing_screen.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/home/presentation/screens/dashboard_screen.dart';
import '../../features/auth/presentation/screens/signup_screen.dart';
import '../../features/auth/presentation/screens/verify_otp_screen.dart';
import '../../features/albums/presentation/screens/albums_screen.dart';
import '../../features/albums/presentation/screens/album_detail_screen.dart';
import '../../features/settings/presentation/screens/settings_screen.dart';
import '../../features/settings/presentation/screens/pricing_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/wallet/presentation/screens/wallet_screen.dart';
import '../../core/services/crypto_service.dart';
import '../../core/services/secure_storage_service.dart';
import '../../core/constants/api_constants.dart';
import '../../core/services/auth_service.dart';

final GlobalKey<NavigatorState> _rootNavigatorKey = GlobalKey<NavigatorState>();

final GoRouter appRouter = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/',
  routes: [
    GoRoute(
      path: '/',
      builder: (context, state) => const LandingScreen(),
    ),
    GoRoute(
      path: '/login',
      builder: (context, state) => const LoginScreen(),
    ),
    GoRoute(
      path: '/dashboard',
      builder: (context, state) => const DashboardScreen(),
    ),
    GoRoute(
      path: '/signup',
      builder: (context, state) => const SignUpScreen(),
    ),
    GoRoute(
      path: '/verify-otp',
      builder: (context, state) {
        final email = state.extra as String? ?? '';
        return VerifyOtpScreen(email: email);
      },
    ),
    GoRoute(
      path: '/settings',
      builder: (context, state) => const SettingsScreen(),
      routes: [
        GoRoute(
          path: 'pricing',
          builder: (context, state) => const PricingScreen(),
        ),
      ],
    ),
    GoRoute(
      path: '/wallet',
      builder: (context, state) => const WalletScreen(),
    ),
    GoRoute(
      path: '/profile',
      builder: (context, state) {
        return ProfileScreen(
          onLogout: () async {
            final authService = AuthService(
              cryptoService: CryptoService(),
              storageService: SecureStorageService(),
              apiBaseUrl: ApiConstants.baseUrl,
            );
            await authService.logout();
            if (context.mounted) context.go('/');
          },
        );
      },
    ),
    GoRoute(
      path: '/albums',
      builder: (context, state) => const AlbumsScreen(),
      routes: [
        GoRoute(
          path: ':id',
          builder: (context, state) {
            final id = state.pathParameters['id'] ?? '';
            return AlbumDetailScreen(albumId: id);
          },
        ),
      ],
    ),
  ],
);
