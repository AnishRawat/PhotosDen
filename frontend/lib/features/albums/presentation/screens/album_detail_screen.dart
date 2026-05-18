import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/network/network_service.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/services/upload_service.dart';
import '../../../../core/utils/toast_utils.dart';
import '../../data/models/album.dart';
import '../../data/services/album_service.dart';
import '../../../wallet/providers/wallet_provider.dart';
import '../../../../core/constants/app_strings.dart';

class AlbumDetailScreen extends ConsumerStatefulWidget {
  final String albumId;
  const AlbumDetailScreen({super.key, required this.albumId});

  @override
  ConsumerState<AlbumDetailScreen> createState() => _AlbumDetailScreenState();
}

class _AlbumDetailScreenState extends ConsumerState<AlbumDetailScreen> {
  late AuthService _authService;
  late AlbumService _albumService;
  late UploadService _uploadService;

  bool _isLoading = true;
  bool _isUploading = false;
  int _uploadProgress = 0;
  int _uploadTotal = 0;
  Album? _album;
  List<AlbumPhoto> _photos = [];

  @override
  void initState() {
    super.initState();
    _initServices();
  }

  Future<void> _initServices() async {
    final crypto = CryptoService();
    final storage = SecureStorageService();
    _authService = AuthService(
      cryptoService: crypto,
      storageService: storage,
      apiBaseUrl: ApiConstants.baseUrl,
    );
    await _authService.loadSession();

    final network = NetworkService(_authService);
    _albumService = AlbumService(network);
    _uploadService = UploadService(network, crypto, _authService, storage);

    _loadAlbumDetails();
  }

  Future<void> _loadAlbumDetails() async {
    setState(() => _isLoading = true);
    try {
      final album = await _albumService.getAlbum(widget.albumId);
      final photos = await _albumService.getAlbumPhotos(widget.albumId);
      if (mounted) setState(() { _album = album; _photos = photos; });
    } catch (e) {
      if (mounted) {
        ToastUtils.showError(context, 'Failed to load album');
        context.pop();
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _addPhotos() async {
    try {
      final walletState = await ref.read(walletProvider.future);
      if (walletState.balance != null && walletState.balance!.balanceAvailable <= 0) {
        final proceed = await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text(AppStrings.walletEmptyWarningTitle),
            content: const Text(AppStrings.walletEmptyWarningBody),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text(AppStrings.cancel),
              ),
              ElevatedButton(
                onPressed: () => Navigator.pop(context, true),
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.primaryBlue, foregroundColor: Colors.white),
                child: const Text(AppStrings.proceed),
              ),
            ],
          ),
        );

        if (proceed != true) return;
      }
    } catch (e) {
      print('Wallet check failed: $e');
    }

    final picker = ImagePicker();
    final images = await picker.pickMultiImage();
    if (images.isEmpty) return;

    setState(() {
      _isUploading = true;
      _uploadProgress = 0;
      _uploadTotal = images.length;
    });

    try {
      await _uploadService.uploadPhotos(
        images,
        source: UploadSource.album,
        albumId: widget.albumId,
        onProgress: (done, total) {
          setState(() {
            _uploadProgress = done;
            _uploadTotal = total;
          });
        },
      );
      if (mounted) {
        ToastUtils.showSuccess(context, AppStrings.uploadSuccess(images.length));
        _loadAlbumDetails(); // refresh
      }
    } catch (e) {
      if (mounted) ToastUtils.showError(context, '${AppStrings.uploadFailed}$e');
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    if (_album == null) {
      return Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        body: const Center(child: Text('Album not found')),
      );
    }

    return Scaffold(
      backgroundColor: Theme.of(context).scaffoldBackgroundColor,
      appBar: AppBar(
        title: Text(_album!.name, style: AppTextStyles.headline.copyWith(fontSize: 20)),
        backgroundColor: Theme.of(context).colorScheme.surface,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: Theme.of(context).iconTheme.color),
          onPressed: () => context.go('/albums'),
        ),
        actions: [
          if (_isUploading)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      value: _uploadTotal > 0 ? _uploadProgress / _uploadTotal : null,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text('$_uploadProgress / $_uploadTotal',
                      style: TextStyle(fontSize: 13, color: Theme.of(context).textTheme.bodySmall?.color)),
                ],
              ),
            )
          else
            TextButton.icon(
              onPressed: _addPhotos,
              icon: const Icon(Icons.add_photo_alternate_outlined),
              label: const Text('Add Photos'),
              style: TextButton.styleFrom(foregroundColor: AppColors.primaryBlue),
            ),
          const SizedBox(width: 8),
        ],
      ),
      body: _photos.isEmpty
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.photo_library_outlined, size: 80,
                      color: Colors.grey.withOpacity(0.3)),
                  const SizedBox(height: 24),
                  Text('No photos yet',
                      style: AppTextStyles.headline.copyWith(color: Colors.grey)),
                  const SizedBox(height: 8),
                  const Text('Add photos to create memories',
                      style: TextStyle(color: Colors.grey)),
                  const SizedBox(height: 32),
                  ElevatedButton.icon(
                    onPressed: _isUploading ? null : _addPhotos,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Photos'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryBlue,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                      textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            )
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 140,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
              ),
              itemCount: _photos.length,
              itemBuilder: (context, index) {
                final photo = _photos[index];
                return Container(
                  decoration: BoxDecoration(
                    color: Theme.of(context).brightness == Brightness.dark ? Colors.grey.shade800 : Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (photo.thumbnailUrl != null)
                        Image.network(
                          photo.thumbnailUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (c, e, s) =>
                              const Icon(Icons.broken_image, color: Colors.grey),
                        )
                      else
                        const Icon(Icons.lock, color: AppColors.primaryBlue),
                      Positioned(
                        bottom: 0, left: 0, right: 0,
                        child: Container(
                          padding: const EdgeInsets.all(4),
                          color: Colors.black45,
                          child: Text(
                            photo.originalFilename,
                            style: const TextStyle(color: Colors.white, fontSize: 10),
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
