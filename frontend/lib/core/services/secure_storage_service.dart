import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:cryptography/cryptography.dart';

/// Secure Storage Service using flutter_secure_storage
///
/// Stores DEK (Data Encryption Key) in device's secure storage:
/// - iOS: Keychain
/// - Android: Keystore
/// - Web: Browser's secure storage
///
/// Security Notes:
/// - Data is encrypted at rest by the platform
/// - Storage is app-scoped (sandboxed)
/// - DEK is stored as Base64-encoded bytes
///
/// Trade-off: Storing DEK locally enables offline decryption but requires
/// trusting the client device. Lost device with no lock screen = data compromise.
class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(
      encryptedSharedPreferences: true,
    ),
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  static const _dekPrefix = 'dek_';

  /// Store DEK in secure storage
  ///
  /// [userId] User ID (key for storage)
  /// [dek] Data Encryption Key
  Future<void> storeDEK(String userId, SecretKey dek) async {
    try {
      final dekBytes = await dek.extractBytes();
      final dekBase64 = base64Encode(dekBytes);

      await _storage.write(
        key: '$_dekPrefix$userId',
        value: dekBase64,
      );
    } catch (e) {
      throw Exception('Failed to store DEK: $e');
    }
  }

  /// Retrieve DEK from secure storage
  ///
  /// [userId] User ID
  /// Returns DEK or null if not found
  Future<SecretKey?> getDEK(String userId) async {
    try {
      final dekBase64 = await _storage.read(key: '$_dekPrefix$userId');
      
      if (dekBase64 == null) {
        return null;
      }

      final dekBytes = base64Decode(dekBase64);
      return SecretKey(dekBytes);
    } catch (e) {
      throw Exception('Failed to retrieve DEK: $e');
    }
  }

  /// Delete DEK from secure storage (logout)
  ///
  /// [userId] User ID
  Future<void> clearDEK(String userId) async {
    try {
      await _storage.delete(key: '$_dekPrefix$userId');
    } catch (e) {
      throw Exception('Failed to delete DEK: $e');
    }
  }

  /// Clear ALL stored keys (use with caution)
  Future<void> clearAll() async {
    try {
      await _storage.deleteAll();
    } catch (e) {
      throw Exception('Failed to clear storage: $e');
    }
  }

  /// Check if DEK exists for user
  ///
  /// [userId] User ID
  /// Returns true if DEK exists, false otherwise
  Future<bool> hasDEK(String userId) async {
    final dek = await getDEK(userId);
    return dek != null;
  }

  // --- Session Management ---

  /// Store session data
  Future<void> storeSession(String userId, String idToken) async {
    await _storage.write(key: 'session_userId', value: userId);
    await _storage.write(key: 'session_token', value: idToken);
  }

  /// Get stored session
  /// Returns map {userId, idToken} or null
  Future<Map<String, String>?> getSession() async {
    final userId = await _storage.read(key: 'session_userId');
    final token = await _storage.read(key: 'session_token');
    
    if (userId != null && token != null) {
      return {'userId': userId, 'idToken': token};
    }
    return null;
  }

  /// Clear session data
  Future<void> clearSession() async {
    await _storage.delete(key: 'session_userId');
    await _storage.delete(key: 'session_token');
  }
}
