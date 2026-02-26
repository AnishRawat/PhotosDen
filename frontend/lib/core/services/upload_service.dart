import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/network_service.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';

/// Origin of an upload batch.
enum UploadSource { library, album }

/// Progress callback: (completedPhotos, totalPhotos)
typedef UploadProgressCallback = void Function(int completed, int total);

/// Unified upload service for both library and album uploads.
/// 
/// Usage:
///   - Library upload:   `await service.uploadPhotos(files)`
///   - Album upload:     `await service.uploadPhotos(files, source: UploadSource.album, albumId: '...')`
class UploadService {
  final NetworkService _networkService;
  final CryptoService _cryptoService;
  final AuthService _authService;
  final SecureStorageService _storageService;

  UploadService(
    this._networkService,
    this._cryptoService,
    this._authService,
    this._storageService,
  );

  /// Upload a list of photos. 
  /// [source] differentiates library vs album upload.
  /// [albumId] is required when source == album.
  /// [onProgress] is called after each S3 photo upload completes.
  Future<UploadResult> uploadPhotos(
    List<XFile> files, {
    UploadSource source = UploadSource.library,
    String? albumId,
    UploadProgressCallback? onProgress,
  }) async {
    if (files.isEmpty) throw ArgumentError('No files to upload');
    if (source == UploadSource.album && (albumId == null || albumId.isEmpty)) {
      throw ArgumentError('albumId is required for album uploads');
    }

    final userId = _authService.currentUserId;
    if (userId == null) throw Exception('User not logged in');

    final dek = await _storageService.getDEK(userId);
    if (dek == null) throw Exception('DEK not found — please log in again');

    final total = files.length;

    // ── Step 1: Encrypt all photos locally ─────────────────────────────────
    final List<_EncryptedPhotoData> encrypted = [];
    for (final file in files) {
      final bytes = await file.readAsBytes();
      final encFile = await _cryptoService.encryptFile(bytes, dek);

      final thumbBytes = _cryptoService.generateThumbnail(bytes);
      _EncryptedPhotoData? thumbData;
      if (thumbBytes != null) {
        final encThumb = await _cryptoService.encryptFile(thumbBytes, dek);
        thumbData = _EncryptedPhotoData(
          bytes: encThumb.encryptedBytes,
          nonce: encThumb.nonce,
          size: encThumb.encryptedSize,
        );
      }

      encrypted.add(_EncryptedPhotoData(
        bytes: encFile.encryptedBytes,
        nonce: encFile.nonce,
        size: encFile.encryptedSize,
        originalFilename: file.name,
        mimeType: _mimeFromName(file.name),
        thumbnail: thumbData,
      ));
    }

    // ── Step 2: Initiate upload on backend ─────────────────────────────────
    final photoMeta = encrypted.map((e) => {
      'originalFilename': e.originalFilename,
      'mimeType': e.mimeType,
      'encryptedSize': e.size,
      'iv': e.nonce,
      'hasThumbnail': e.thumbnail != null,
      if (e.thumbnail != null) 'thumbnailIV': e.thumbnail!.nonce,
      'capturedAt': DateTime.now().toIso8601String(),
    }).toList();

    final initResp = await _networkService.dio.post(
      ApiConstants.uploads,
      data: {
        'photos': photoMeta,
        'source': source == UploadSource.album ? 'album' : 'library',
        if (albumId != null) 'albumId': albumId,
      },
    );

    final uploadId = initResp.data['uploadId'] as String;
    final presignedList = initResp.data['photos'] as List;

    // ── Step 3: Upload encrypted blobs to S3 ───────────────────────────────
    final plainDio = Dio(); // raw Dio — no auth headers for S3 presigned URLs
    int completed = 0;

    for (int i = 0; i < presignedList.length; i++) {
      final urls = presignedList[i];
      final data = encrypted[i];

      // Upload full-res
      await plainDio.put(
        urls['presignedUrl'] as String,
        data: Stream.fromIterable([data.bytes]),
        options: Options(headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': data.size,
        }),
      );

      // Upload thumbnail if present
      if (data.thumbnail != null && urls['thumbnailPresignedUrl'] != null) {
        await plainDio.put(
          urls['thumbnailPresignedUrl'] as String,
          data: Stream.fromIterable([data.thumbnail!.bytes]),
          options: Options(headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': data.thumbnail!.size,
          }),
        );
      }

      completed++;
      onProgress?.call(completed, total);
    }

    // ── Step 4: Complete the upload ────────────────────────────────────────
    await _networkService.dio.post('${ApiConstants.uploads}/$uploadId/complete');

    return UploadResult(
      uploadId: uploadId,
      photoCount: total,
      source: source,
      albumId: albumId,
    );
  }

  String _mimeFromName(String filename) {
    final ext = filename.split('.').last.toLowerCase();
    switch (ext) {
      case 'png': return 'image/png';
      case 'gif': return 'image/gif';
      case 'webp': return 'image/webp';
      case 'heic': return 'image/heic';
      default: return 'image/jpeg';
    }
  }
}

class UploadResult {
  final String uploadId;
  final int photoCount;
  final UploadSource source;
  final String? albumId;

  UploadResult({
    required this.uploadId,
    required this.photoCount,
    required this.source,
    this.albumId,
  });
}

class _EncryptedPhotoData {
  final Uint8List bytes;
  final String nonce;
  final int size;
  final String originalFilename;
  final String mimeType;
  final _EncryptedPhotoData? thumbnail;

  _EncryptedPhotoData({
    required this.bytes,
    required this.nonce,
    required this.size,
    this.originalFilename = '',
    this.mimeType = 'image/jpeg',
    this.thumbnail,
  });
}
