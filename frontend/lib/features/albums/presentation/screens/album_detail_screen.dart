import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/network/network_service.dart';
import '../../../../core/constants/api_constants.dart';
import '../../data/models/album.dart';
import '../../data/services/album_service.dart';
import '../../../../core/utils/toast_utils.dart';

class AlbumDetailScreen extends StatefulWidget {
  final String albumId;

  const AlbumDetailScreen({super.key, required this.albumId});

  @override
  State<AlbumDetailScreen> createState() => _AlbumDetailScreenState();
}

class _AlbumDetailScreenState extends State<AlbumDetailScreen> {
  late AuthService _authService;
  late AlbumService _albumService;
  
  bool _isLoading = true;
  Album? _album;
  List<dynamic> _photos = []; // Placeholder for actual photos when implemented

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
        apiBaseUrl: ApiConstants.baseUrl
    );
    await _authService.loadSession();

    final network = NetworkService(_authService);
    _albumService = AlbumService(network);

    _loadAlbumDetails();
  }

  Future<void> _loadAlbumDetails() async {
    setState(() => _isLoading = true);
    try {
      final album = await _albumService.getAlbum(widget.albumId);
      // In future: fetch photos for this album here
      if (mounted) setState(() => _album = album);
    } catch (e) {
      if (mounted) {
        ToastUtils.showError(context, 'Failed to load album details');
        context.pop(); // Go back if failed
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }
  
  void _addPhotos() {
    // TODO: Implement Photo Picker
    ToastUtils.showInfo(context, 'Add Photos functionality coming soon');
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(child: CircularProgressIndicator()),
      );
    }

    if (_album == null) {
      return const Scaffold(
        backgroundColor: AppColors.background,
        body: Center(child: Text('Album not found')),
      );
    }

    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        title: Text(_album!.name, style: AppTextStyles.headline.copyWith(fontSize: 20)),
        backgroundColor: AppColors.surface,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.black),
          onPressed: () => context.go('/albums'),
        ),
        actions: [
          TextButton.icon(
            onPressed: _addPhotos,
            icon: const Icon(Icons.add_photo_alternate_outlined),
            label: const Text('Add Photos'),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: _album!.photoCount == 0
          ? Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.photo_library_outlined, size: 80, color: Colors.grey.withOpacity(0.3)),
                  const SizedBox(height: 24),
                  Text(
                    'No photos yet',
                    style: AppTextStyles.headline.copyWith(color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Add photos to create memories',
                    style: TextStyle(color: Colors.grey),
                  ),
                  const SizedBox(height: 32),
                  ElevatedButton.icon(
                    onPressed: _addPhotos,
                    icon: const Icon(Icons.add),
                    label: const Text('Add Photos'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryBlue,
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
                maxCrossAxisExtent: 200,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
              ),
              itemCount: _album!.photoCount, // Placeholder: showing "ghost" items based on count
              itemBuilder: (context, index) {
                return Container(
                  color: Colors.grey[300],
                  child: const Center(child: Icon(Icons.image, color: Colors.white)),
                );
              },
            ),
    );
  }
}
