import 'dart:typed_data';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:photo_manager/photo_manager.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/constants/app_strings.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/services/upload_service.dart';
import '../../../../core/network/network_service.dart';
import '../../../wallet/providers/wallet_provider.dart';
import '../widgets/main_web_layout.dart';
import 'package:go_router/go_router.dart';

class DeviceGalleryScreen extends ConsumerStatefulWidget {
  final int selectedIndex;
  final Function(int) onDestinationSelected;
  final VoidCallback onLogout;

  const DeviceGalleryScreen({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.onLogout,
  });

  @override
  ConsumerState<DeviceGalleryScreen> createState() => _DeviceGalleryScreenState();
}

class _DeviceGalleryScreenState extends ConsumerState<DeviceGalleryScreen> {
  List<AssetEntity> _devicePhotos = [];
  Set<String> _selectedIds = {};
  bool _isSelectionMode = false;
  bool _isLoading = true;
  bool _hasPermission = false;
  bool _isUploading = false;
  int _uploadProgress = 0;
  int _uploadTotal = 0;
  String? _permissionDeniedReason;

  late UploadService _uploadService;
  late AuthService _authService;
  bool _servicesReady = false;

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
    _uploadService = UploadService(network, crypto, _authService, storage);
    setState(() => _servicesReady = true);

    if (!kIsWeb) {
      await _requestAndLoadPhotos();
    } else {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _requestAndLoadPhotos() async {
    final permission = await PhotoManager.requestPermissionExtend();
    if (permission.isAuth || permission.hasAccess) {
      setState(() => _hasPermission = true);
      await _loadDevicePhotos();
    } else if (permission == PermissionState.limited) {
      setState(() => _hasPermission = true);
      await _loadDevicePhotos();
    } else {
      setState(() {
        _hasPermission = false;
        _isLoading = false;
        _permissionDeniedReason = 'Gallery access was denied. Please enable it in your device settings.';
      });
    }
  }

  Future<void> _loadDevicePhotos() async {
    setState(() => _isLoading = true);
    try {
      final albums = await PhotoManager.getAssetPathList(
        type: RequestType.image,
        onlyAll: true,
      );
      if (albums.isNotEmpty) {
        final assets = await albums.first.getAssetListRange(
          start: 0,
          end: 300,
        );
        setState(() => _devicePhotos = assets);
      }
    } catch (e) {
      debugPrint('Error loading device photos: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _toggleSelect(String id) {
    setState(() {
      if (_selectedIds.contains(id)) {
        _selectedIds.remove(id);
        if (_selectedIds.isEmpty) _isSelectionMode = false;
      } else {
        _selectedIds.add(id);
      }
    });
  }

  void _onLongPress(String id) {
    setState(() {
      _isSelectionMode = true;
      _selectedIds.add(id);
    });
  }

  void _clearSelection() {
    setState(() {
      _selectedIds.clear();
      _isSelectionMode = false;
    });
  }

  Future<void> _uploadSelected() async {
    if (_selectedIds.isEmpty) return;

    // Wallet check
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
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryBlue,
                  foregroundColor: Colors.white,
                ),
                child: const Text(AppStrings.proceed),
              ),
            ],
          ),
        );
        if (proceed != true) return;
      }
    } catch (e) {
      debugPrint('Wallet check failed: $e');
    }

    // Convert AssetEntity → XFile
    final List<XFile> xFiles = [];
    for (final id in _selectedIds) {
      final asset = _devicePhotos.firstWhere((a) => a.id == id);
      final file = await asset.originFile;
      if (file != null) {
        xFiles.add(XFile(file.path));
      }
    }

    if (xFiles.isEmpty) return;

    setState(() {
      _isUploading = true;
      _uploadProgress = 0;
      _uploadTotal = xFiles.length;
    });

    try {
      await _uploadService.uploadPhotos(
        xFiles,
        source: UploadSource.library,
        onProgress: (done, total) {
          setState(() {
            _uploadProgress = done;
            _uploadTotal = total;
          });
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppStrings.uploadSuccess(xFiles.length))),
        );
        _clearSelection();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${AppStrings.uploadFailed}$e'),
            backgroundColor: Colors.red.shade400,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  // Web fallback: open picker
  Future<void> _openPickerWeb() async {
    try {
      final walletState = await ref.read(walletProvider.future);
      if (walletState.balance != null && walletState.balance!.balanceAvailable <= 0) {
        final proceed = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text(AppStrings.walletEmptyWarningTitle),
            content: const Text(AppStrings.walletEmptyWarningBody),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text(AppStrings.cancel)),
              ElevatedButton(
                onPressed: () => Navigator.pop(ctx, true),
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.primaryBlue, foregroundColor: Colors.white),
                child: const Text(AppStrings.proceed),
              ),
            ],
          ),
        );
        if (proceed != true) return;
      }
    } catch (e) {
      debugPrint('Wallet check failed: $e');
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
        source: UploadSource.library,
        onProgress: (done, total) => setState(() {
          _uploadProgress = done;
          _uploadTotal = total;
        }),
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppStrings.uploadSuccess(images.length))),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${AppStrings.uploadFailed}$e'), backgroundColor: Colors.red.shade400),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return MainWebLayout(
      selectedIndex: widget.selectedIndex,
      onDestinationSelected: widget.onDestinationSelected,
      onLogout: widget.onLogout,
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        floatingActionButton: _isSelectionMode
            ? null
            : FloatingActionButton.extended(
                onPressed: kIsWeb ? _openPickerWeb : () {
                  setState(() => _isSelectionMode = true);
                },
                icon: const Icon(Icons.add_a_photo_outlined),
                label: Text(kIsWeb ? 'Upload Photos' : 'Select Photos'),
                backgroundColor: AppColors.primaryBlue,
              ),
        body: Stack(
          children: [
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header row
                  Row(
                    children: [
                      Text('Photos', style: AppTextStyles.headline),
                      const Spacer(),
                      if (_isSelectionMode) ...[
                        Text(
                          '${_selectedIds.length} selected',
                          style: AppTextStyles.bodyMedium.copyWith(color: AppColors.primaryBlue),
                        ),
                        const SizedBox(width: 12),
                        TextButton(onPressed: _clearSelection, child: const Text('Cancel')),
                        const SizedBox(width: 8),
                        ElevatedButton.icon(
                          onPressed: _selectedIds.isEmpty ? null : _uploadSelected,
                          icon: const Icon(Icons.cloud_upload_outlined, size: 16),
                          label: const Text('Upload'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primaryBlue,
                            foregroundColor: Colors.white,
                          ),
                        ),
                      ],
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (!kIsWeb)
                    Text(
                      'Long-press a photo to select. Tap "Select Photos" to multi-select.',
                      style: AppTextStyles.bodyMedium.copyWith(
                        color: Theme.of(context).textTheme.bodySmall?.color,
                        fontSize: 12,
                      ),
                    ),
                  const SizedBox(height: 16),
                  Expanded(child: _buildBody()),
                ],
              ),
            ),
            // Upload progress overlay
            if (_isUploading)
              Positioned.fill(
                child: Container(
                  color: Colors.black54,
                  child: Center(
                    child: Container(
                      margin: const EdgeInsets.all(32),
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.cloud_upload_outlined, size: 48, color: AppColors.primaryBlue),
                          const SizedBox(height: 16),
                          Text('Uploading photos...', style: AppTextStyles.headline),
                          const SizedBox(height: 8),
                          Text('$_uploadProgress / $_uploadTotal', style: AppTextStyles.bodyMedium),
                          const SizedBox(height: 16),
                          LinearProgressIndicator(
                            value: _uploadTotal > 0 ? _uploadProgress / _uploadTotal : 0,
                            backgroundColor: Colors.grey.shade200,
                            color: AppColors.primaryBlue,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (kIsWeb) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.photo_library_outlined, size: 80, color: Theme.of(context).iconTheme.color?.withOpacity(0.3)),
            const SizedBox(height: 16),
            Text('Your Device Photos', style: AppTextStyles.headline),
            const SizedBox(height: 8),
            Text(
              'Gallery browsing is available on the mobile app.\nOn web, use the "Upload Photos" button to select images from your device.',
              style: AppTextStyles.bodyMedium.copyWith(color: Theme.of(context).textTheme.bodySmall?.color),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      );
    }

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (!_hasPermission) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.photo_library_outlined, size: 80, color: Theme.of(context).iconTheme.color?.withOpacity(0.3)),
            const SizedBox(height: 16),
            Text('Gallery Access Needed', style: AppTextStyles.headline),
            const SizedBox(height: 8),
            Text(
              _permissionDeniedReason ?? 'Allow access to browse and upload your photos.',
              style: AppTextStyles.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: () => PhotoManager.openSetting(),
              icon: const Icon(Icons.settings_outlined),
              label: const Text('Open Settings'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryBlue,
                foregroundColor: Colors.white,
              ),
            ),
          ],
        ),
      );
    }

    if (_devicePhotos.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.photo_library_outlined, size: 80, color: Theme.of(context).iconTheme.color?.withOpacity(0.3)),
            const SizedBox(height: 16),
            Text('No Photos Found', style: AppTextStyles.headline),
          ],
        ),
      );
    }

    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 140,
        childAspectRatio: 1,
        crossAxisSpacing: 4,
        mainAxisSpacing: 4,
      ),
      itemCount: _devicePhotos.length,
      itemBuilder: (context, index) {
        final asset = _devicePhotos[index];
        final isSelected = _selectedIds.contains(asset.id);
        return _DeviceTile(
          asset: asset,
          isSelected: isSelected,
          isSelectionMode: _isSelectionMode,
          onTap: () {
            if (_isSelectionMode) {
              _toggleSelect(asset.id);
            }
          },
          onLongPress: () => _onLongPress(asset.id),
        );
      },
    );
  }
}

class _DeviceTile extends StatefulWidget {
  final AssetEntity asset;
  final bool isSelected;
  final bool isSelectionMode;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _DeviceTile({
    required this.asset,
    required this.isSelected,
    required this.isSelectionMode,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  State<_DeviceTile> createState() => _DeviceTileState();
}

class _DeviceTileState extends State<_DeviceTile> {
  Uint8List? _thumb;

  @override
  void initState() {
    super.initState();
    _loadThumb();
  }

  Future<void> _loadThumb() async {
    final data = await widget.asset.thumbnailDataWithSize(const ThumbnailSize(200, 200));
    if (mounted) setState(() => _thumb = data);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: widget.onTap,
      onLongPress: widget.onLongPress,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        decoration: BoxDecoration(
          border: widget.isSelected ? Border.all(color: AppColors.primaryBlue, width: 3) : null,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(widget.isSelected ? 2 : 4),
              child: _thumb != null
                  ? Image.memory(_thumb!, fit: BoxFit.cover)
                  : Container(color: Colors.grey.shade300),
            ),
            if (widget.isSelected)
              Positioned(
                top: 6,
                right: 6,
                child: Container(
                  padding: const EdgeInsets.all(2),
                  decoration: const BoxDecoration(
                    color: AppColors.primaryBlue,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check, size: 14, color: Colors.white),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
