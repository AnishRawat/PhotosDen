import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import '../../../../core/constants/api_constants.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/auth_service.dart';

class AppUser {
  final String id;
  final String name;
  final String email;
  final String? phoneNumber;

  AppUser({
    required this.id,
    required this.name,
    required this.email,
    this.phoneNumber,
  });

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['userId'] ?? json['id'] ?? '',
      name: json['name'] ?? 'Unknown User',
      email: json['email'] ?? json['identifier'] ?? 'Unknown Email',
      phoneNumber: json['phoneNumber'] ?? json['phone'],
    );
  }
}

class AuthState {
  final AppUser? user;
  final bool isLoading;
  final String? error;

  AuthState({this.user, this.isLoading = false, this.error});

  AuthState copyWith({AppUser? user, bool? isLoading, String? error}) {
    return AuthState(
      user: user ?? this.user,
      isLoading: isLoading ?? this.isLoading,
      error: error ?? this.error,
    );
  }
}

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

class AuthNotifier extends Notifier<AuthState> {
  final SecureStorageService _storageService = SecureStorageService();
  late final AuthService _authService;

  @override
  AuthState build() {
    _authService = AuthService(
      cryptoService: CryptoService(),
      storageService: SecureStorageService(),
      apiBaseUrl: ApiConstants.baseUrl,
    );
    Future.microtask(_loadUser);
    return AuthState();
  }

  Future<void> _loadUser() async {
    state = state.copyWith(isLoading: true);
    try {
      final hasSession = await _authService.loadSession();
      if (!hasSession || _authService.idToken == null) {
        state = state.copyWith(isLoading: false, error: 'No active session');
        return;
      }

      // Fetch user profile from backend
      final url = Uri.parse('${ApiConstants.baseUrl}/profile');
      final response = await http.get(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${_authService.idToken}',
        },
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (data['success'] == true && data['data'] != null) {
          final user = AppUser.fromJson(data['data']);
          state = AuthState(user: user, isLoading: false);
        } else {
          // If response is successful but format differs
           final user = AppUser.fromJson(data);
           state = AuthState(user: user, isLoading: false);
        }
      } else {
        state = state.copyWith(isLoading: false, error: 'Failed to load profile');
      }
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> refresh() async {
    await _loadUser();
  }
}
