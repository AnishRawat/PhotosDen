import 'dart:convert';
import 'package:cryptography/cryptography.dart';
import 'package:http/http.dart' as http;
import '../services/crypto_service.dart';
import '../services/secure_storage_service.dart';

/// Zero-Knowledge Authentication Service
///
/// Integrates CryptoService with backend authentication endpoints.
/// Handles client-side key derivation and DEK management.
///
/// Flow:
/// - Signup: Generate DEK, derive Master Key, encrypt DEK, send to backend
/// - Login: Retrieve encrypted DEK, derive Master Key, decrypt DEK, store locally
/// - Logout: Clear DEK from local storage
class AuthService {
  final CryptoService _cryptoService;
  final SecureStorageService _storageService;
  final String  _apiBaseUrl;

  String? _accessToken;
  String? _currentUserId;

  AuthService({
    required CryptoService cryptoService,
    required SecureStorageService storageService,
    required String apiBaseUrl,
  })  : _cryptoService = cryptoService,
        _storageService = storageService,
        _apiBaseUrl = apiBaseUrl;

  /// Signup with zero-knowledge encryption
  ///
  /// Steps:
  /// 1. Generate random DEK
  /// 2. Generate random salt
  /// 3. Derive Master Key from password
  /// 4. Encrypt DEK with Master Key
  /// 5. Send encrypted DEK + salt to backend
  /// 6. Store DEK locally (only after successful signup)
  Future<SignupResponse> signup({
    required String email,
    required String password,
  }) async {
    try {
      // Step 1: Generate DEK (this will encrypt ALL user files)
      final dek = await _cryptoService.generateDEK();

      // Step 2: Generate random salt for PBKDF2
      final salt = _cryptoService.generateSalt();

      // Step 3: Derive Master Key from password
      final masterKey = await _cryptoService.deriveMasterKey(password, salt);

      // Step 4: Encrypt DEK with Master Key
      final encryptedDEKResult = await _cryptoService.encryptDEK(dek, masterKey);

      // Step 5: Send to backend
      final response = await http.post(
        Uri.parse('$_apiBaseUrl/auth/signup'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'identifier': email,
          'password': password,
          'encryptedDEK': encryptedDEKResult.encryptedDEK,
          'kdfSalt': base64Encode(salt),
          'kdfIterations': 100000,
        }),
      );

      if (response.statusCode != 200 && response.statusCode != 201) {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Signup failed');
      }

      final data = jsonDecode(response.body);

      // Step 6: Store DEK locally for future use
      final userId = data['userId'] as String;
      await _storageService.storeDEK(userId, dek);

      return SignupResponse(
        verificationRequired: data['verificationRequired'] ?? true,
        userId: userId,
        correlationId: data['correlationId'] ?? '',
      );
    } catch (e) {
      print('Signup error: $e');
      throw Exception('Signup failed: $e');
    }
  }

  /// Login with zero-knowledge encryption
  ///
  /// Steps:
  /// 1. Authenticate with backend (get encrypted DEK + salt)
  /// 2. Derive Master Key from password
  /// 3. Decrypt DEK with Master Key
  /// 4. Store DEK locally for session
  Future<LoginResponse> login({
    required String email,
    required String password,
  }) async {
    try {
      // Step 1: Authenticate with backend
      final response = await http.post(
        Uri.parse('$_apiBaseUrl/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'identifier': email,
          'password': password,
        }),
      );

      if (response.statusCode != 200) {
        final error = jsonDecode(response.body);
        throw Exception(error['message'] ?? 'Login failed');
      }

      final data = jsonDecode(response.body);

      // Step 2: Derive Master Key from password
      final salt = base64Decode(data['kdfSalt']);
      final iterations = data['kdfIterations'] as int;
      final masterKey = await _cryptoService.deriveMasterKey(
        password,
        salt,
        iterations: iterations,
      );

      // Step 3: Decrypt DEK with Master Key
      final dek = await _cryptoService.decryptDEK(
        data['encryptedDEK'],
        masterKey,
      );

      // Step 4: Store DEK locally
      final userId = data['userId'] as String;
      await _storageService.storeDEK(userId, dek);

      // Store tokens for API calls
      _currentUserId = userId;
      _accessToken = data['accessToken'];

      return LoginResponse(
        idToken: data['idToken'],
        accessToken: data['accessToken'],
        refreshToken: data['refreshToken'],
        expiresIn: data['expiresIn'],
        userId: userId,
        correlationId: data['correlationId'] ?? '',
      );
    } catch (e) {
      print('Login error: $e');
      throw Exception('Login failed: $e');
    }
  }

  /// Change password with DEK re-encryption
  ///
  /// Steps:
  /// 1. Get current DEK from local storage
  /// 2. Generate new salt
  /// 3. Derive NEW Master Key from new password
  /// 4. Re-encrypt SAME DEK with NEW Master Key
  /// 5. Send to backend
  ///
  /// CRITICAL: DEK never changes, only its encryption wrapper
  Future<void> changePassword({
    required String oldPassword,
    required String newPassword,
  }) async {
    if (_currentUserId == null || _accessToken == null) {
      throw Exception('Not authenticated');
    }

    try {
      // Step 1: Get current DEK
      final dek = await _storageService.getDEK(_currentUserId!);
      if (dek == null) {
        throw Exception('DEK not found. Please login again.');
      }

      // Step 2: Generate new salt
      final newSalt = _cryptoService.generateSalt();

      // Step 3: Derive NEW Master Key from new password
      final newMasterKey = await _cryptoService.deriveMasterKey(
        newPassword,
        newSalt,
      );

      // Step 4: Re-encrypt SAME DEK with NEW Master Key
      final newEncryptedDEK = await _cryptoService.encryptDEK(dek, newMasterKey);

      // Step 5: Send to backend
      final response = await http.put(
        Uri.parse('$_apiBaseUrl/profile/password'),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $_accessToken',
        },
        body: jsonEncode({
          'oldPassword': oldPassword,
          'newPassword': newPassword,
          'newEncryptedDEK': newEncryptedDEK.encryptedDEK,
          'newKdfSalt': base64Encode(newSalt),
          'newKdfIterations': 100000,
        }),
      );

      if (response.statusCode != 200) {
        final error = jsonDecode(response.body);

        // Handle critical partial failure
        if (error['error'] == 'PartialFailure') {
          throw Exception(
            'CRITICAL: Password changed but encryption update failed. '
            'Contact support immediately! UserId: ${error['userId']}',
          );
        }

        throw Exception(error['message'] ?? 'Password change failed');
      }

      // Success - DEK remains the same, just re-encrypted
    } catch (e) {
      print('Password change error: $e');
      rethrow;
    }
  }

  /// Logout - clear DEK from local storage
  Future<void> logout() async {
    if (_currentUserId != null) {
      await _storageService.clearDEK(_currentUserId!);
    }

    _currentUserId = null;
    _accessToken = null;
  }

  /// Check if user has valid session (DEK available)
  Future<bool> hasValidSession(String userId) async {
    return await _storageService.hasDEK(userId);
  }

  /// Get current user ID
  String? get currentUserId => _currentUserId;

  /// Get access token for API calls
  String? get accessToken => _accessToken;

  /// Set access token (for page refresh scenarios)
  void setAccessToken(String token, String userId) {
    _accessToken = token;
    _currentUserId = userId;
  }
}

/// Signup response
class SignupResponse {
  final bool verificationRequired;
  final String userId;
  final String correlationId;

  SignupResponse({
    required this.verificationRequired,
    required this.userId,
    required this.correlationId,
  });
}

/// Login response
class LoginResponse {
  final String idToken;
  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  final String userId;
  final String correlationId;

  LoginResponse({
    required this.idToken,
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.userId,
    required this.correlationId,
  });
}
