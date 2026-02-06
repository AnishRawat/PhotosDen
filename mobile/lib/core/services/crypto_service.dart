import 'dart:convert';
import 'dart:typed_data';
import 'package:cryptography/cryptography.dart';
import 'package:image/image.dart' as img;

/// Zero-Knowledge Cryptography Service
///
/// This service implements client-side encryption using AES-256-GCM.
/// Server NEVER sees plaintext data or decryption keys.
///
/// Encryption Architecture:
/// 1. Password → PBKDF2 → Master Key (never stored)
/// 2. Master Key + DEK → Encrypted DEK (stored in DB)
/// 3. DEK + File → Encrypted File (stored in S3)
///
/// Security Requirements:
/// - AES-256-GCM for all encryption
/// - PBKDF2-HMAC-SHA256 with 100,000+ iterations
/// - 96-bit random nonces (never reused)
/// - 32-byte random salts
class CryptoService {
  // Security constants - DO NOT WEAKEN
  static const int _kdfIterations = 100000; // PBKDF2 iterations (minimum)
  static const int _keyLength = 32; // AES-256 key length in bytes
  static const int _nonceLength = 12; // 96 bits for GCM mode
  static const int _saltLength = 32; // 256 bits for KDF salt

  final _aesGcm = AesGcm.with256bits();
  final _pbkdf2 = Pbkdf2(
    macAlgorithm: Hmac.sha256(),
    iterations: _kdfIterations,
    bits: 256,
  );

  /// Generate cryptographically secure random salt for key derivation
  /// Returns 32-byte random salt
  Uint8List generateSalt() {
    return Uint8List.fromList(
      List<int>.generate(_saltLength, (_) => _secureRandom.nextInt(256)),
    );
  }

  /// Generate cryptographically secure random nonce for encryption
  /// Returns 12-byte random nonce (96 bits for GCM)
  Uint8List generateNonce() {
    return Uint8List.fromList(
      List<int>.generate(_nonceLength, (_) => _secureRandom.nextInt(256)),
    );
  }

  static final _secureRandom = _SecureRandom();

  /// Derive Master Key from password using PBKDF2
  ///
  /// Master Key is NEVER stored - only exists in memory during session
  ///
  /// [password] User's password
  /// [salt] Random salt (from signup or login)
  /// [iterations] PBKDF2 iterations (default: 100,000)
  /// Returns Master Key (32-byte SecretKey)
  Future<SecretKey> deriveMasterKey(
    String password,
    Uint8List salt, {
    int iterations = _kdfIterations,
  }) async {
    if (iterations < _kdfIterations) {
      throw ArgumentError(
        'Iterations must be >= $_kdfIterations for security',
      );
    }

    final pbkdf2Custom = Pbkdf2(
      macAlgorithm: Hmac.sha256(),
      iterations: iterations,
      bits: 256,
    );

    final masterKey = await pbkdf2Custom.deriveKey(
      secretKey: SecretKey(utf8.encode(password)),
      nonce: salt,
    );

    return masterKey;
  }

  /// Generate random Data Encryption Key (DEK)
  ///
  /// DEK is used to encrypt all user files.
  /// DEK itself is encrypted with Master Key and stored in database.
  ///
  /// Returns DEK (32-byte SecretKey)
  Future<SecretKey> generateDEK() async {
    return await _aesGcm.newSecretKey();
  }

  /// Encrypt DEK with Master Key
  ///
  /// [dek] Data Encryption Key
  /// [masterKey] Master Key (derived from password)
  /// Returns encrypted DEK (Base64) and nonce
  Future<EncryptedDEK> encryptDEK(SecretKey dek, SecretKey masterKey) async {
    final nonce = generateNonce();

    // Extract DEK bytes
    final dekBytes = await dek.extractBytes();

    // Encrypt DEK with Master Key
    final secretBox = await _aesGcm.encrypt(
      dekBytes,
      secretKey: masterKey,
      nonce: nonce,
    );

    // Combine nonce + ciphertext + MAC for storage
    final combined = Uint8List.fromList([
      ...nonce,
      ...secretBox.cipherText,
      ...secretBox.mac.bytes,
    ]);

    return EncryptedDEK(
      encryptedDEK: base64Encode(combined),
      nonce: base64Encode(nonce),
    );
  }

  /// Decrypt DEK with Master Key
  ///
  /// [encryptedDEK] Base64-encoded encrypted DEK (nonce + ciphertext + MAC)
  /// [masterKey] Master Key (derived from password)
  /// Returns DEK (32-byte SecretKey)
  Future<SecretKey> decryptDEK(
    String encryptedDEK,
    SecretKey masterKey,
  ) async {
    final combined = base64Decode(encryptedDEK);

    // Extract nonce, ciphertext, and MAC
    final nonce = combined.sublist(0, _nonceLength);
    final cipherText = combined.sublist(_nonceLength, combined.length - 16);
    final mac = Mac(combined.sublist(combined.length - 16));

    // Decrypt DEK
    final secretBox = SecretBox(cipherText, nonce: nonce, mac: mac);
    final dekBytes = await _aesGcm.decrypt(
      secretBox,
      secretKey: masterKey,
    );

    return SecretKey(dekBytes);
  }

  /// Encrypt file with DEK
  ///
  /// [fileBytes] File bytes to encrypt
  /// [dek] Data Encryption Key
  /// Returns encrypted bytes and nonce (Base64)
  Future<EncryptedFile> encryptFile(Uint8List fileBytes, SecretKey dek) async {
    final nonce = generateNonce();

    // Encrypt file
    final secretBox = await _aesGcm.encrypt(
      fileBytes,
      secretKey: dek,
      nonce: nonce,
    );

    // Combine ciphertext + MAC
    final encrypted = Uint8List.fromList([
      ...secretBox.cipherText,
      ...secretBox.mac.bytes,
    ]);

    return EncryptedFile(
      encryptedBytes: encrypted,
      nonce: base64Encode(nonce),
      encryptedSize: encrypted.length,
    );
  }

  /// Decrypt file with DEK
  ///
  /// [encryptedBytes] Encrypted file bytes (ciphertext + MAC)
  /// [nonce] Base64-encoded nonce
  /// [dek] Data Encryption Key
  /// Returns decrypted bytes
  Future<Uint8List> decryptFile(
    Uint8List encryptedBytes,
    String nonce,
    SecretKey dek,
  ) async {
    final nonceBytes = base64Decode(nonce);

    // Extract ciphertext and MAC
    final cipherText = encryptedBytes.sublist(0, encryptedBytes.length - 16);
    final mac = Mac(encryptedBytes.sublist(encryptedBytes.length - 16));

    // Decrypt file
    final secretBox = SecretBox(cipherText, nonce: nonceBytes, mac: mac);
    final decrypted = await _aesGcm.decrypt(secretBox, secretKey: dek);

    return Uint8List.fromList(decrypted);
  }

  /// Generate low-resolution thumbnail from image bytes
  ///
  /// Client-side thumbnail generation eliminates need for server processing
  ///
  /// [imageBytes] Image file bytes
  /// [maxWidth] Maximum width (default: 300px)
  /// [maxHeight] Maximum height (default: 300px)
  /// [quality] JPEG quality 0-100 (default: 70)
  /// Returns thumbnail bytes (JPEG)
  Uint8List? generateThumbnail(
    Uint8List imageBytes, {
    int maxWidth = 300,
    int maxHeight = 300,
    int quality = 70,
  }) {
    try {
      // Decode image
      final image = img.decodeImage(imageBytes);
      if (image == null) return null;

      // Calculate scaled dimensions (maintain aspect ratio)
      int width = image.width;
      int height = image.height;

      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth / width).round();
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight / height).round();
          height = maxHeight;
        }
      }

      // Resize image
      final thumbnail = img.copyResize(
        image,
        width: width,
        height: height,
        interpolation: img.Interpolation.linear,
      );

      // Encode as JPEG
      return Uint8List.fromList(img.encodeJpg(thumbnail, quality: quality));
    } catch (e) {
      print('Thumbnail generation failed: $e');
      return null;
    }
  }

  /// Securely clear sensitive data from memory (best effort)
  /// Note: Dart doesn't provide guaranteed memory wiping
  void clearSensitiveData(Uint8List data) {
    for (int i = 0; i < data.length; i++) {
      data[i] = _secureRandom.nextInt(256);
    }
  }
}

/// Encrypted DEK result
class EncryptedDEK {
  final String encryptedDEK;
  final String nonce;

  EncryptedDEK({required this.encryptedDEK, required this.nonce});
}

/// Encrypted file result
class EncryptedFile {
  final Uint8List encryptedBytes;
  final String nonce;
  final int encryptedSize;

  EncryptedFile({
    required this.encryptedBytes,
    required this.nonce,
    required this.encryptedSize,
  });
}

/// Secure random number generator
class _SecureRandom {
  static final _random = Random.secure();

  int nextInt(int max) => _random.nextInt(max);
}

import 'dart:math';
