import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/constants/api_constants.dart';
import '../widgets/main_web_layout.dart';

import '../../data/services/photo_service.dart';
import '../../../../core/network/network_service.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/services/upload_service.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _selectedIndex = 0;
  List<Photo> _photos = [];
  bool _isLoading = true;
  bool _showFavoritesOnly = false;
  bool _isUploading = false;
  int _uploadProgress = 0;
  int _uploadTotal = 0;

  late PhotoService _photoService;
  late UploadService _uploadService;
  late AuthService _authService;

  @override
  void initState() {
    super.initState();
    _initializeServices();
  }

  Future<void> _initializeServices() async {
    final cryptoService = CryptoService();
    final storageService = SecureStorageService();
    const apiBaseUrl = ApiConstants.baseUrl;

    _authService = AuthService(
      cryptoService: cryptoService,
      storageService: storageService,
      apiBaseUrl: apiBaseUrl,
    );

    final hasSession = await _authService.loadSession();
    if (!hasSession) {
      if (mounted) GoRouter.of(context).go('/login');
      return;
    }

    final networkService = NetworkService(_authService);

    _photoService = PhotoService(
      networkService,
      cryptoService,
      _authService,
      storageService,
    );
    _uploadService = UploadService(
      networkService,
      cryptoService,
      _authService,
      storageService,
    );

    _loadPhotos();
  }

  void _logout() async {
    await _authService.logout();
    if (mounted) GoRouter.of(context).go('/');
  }

  Future<void> _loadPhotos() async {
    setState(() => _isLoading = true);
    try {
      final photos = _showFavoritesOnly
          ? await _photoService.getFavoritePhotos()
          : await _photoService.getPhotos();
      setState(() => _photos = photos);
    } catch (e) {
      print('Failed to load photos: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not load photos: $e')),
        );
        if (!_showFavoritesOnly) {
          // Fallback demo data only for the normal view
          setState(() {
            _photos = [
              Photo(
                photoId: '1',
                originalFilename: 'mountain_trip.jpg',
                iv: 'mock_iv',
                capturedAt: DateTime.now().subtract(const Duration(days: 1)),
                thumbnailUrl: 'https://picsum.photos/200/200',
              ),
              Photo(
                photoId: '2',
                originalFilename: 'family_dinner.jpg',
                iv: 'mock_iv',
                capturedAt: DateTime.now().subtract(const Duration(days: 2)),
                thumbnailUrl: 'https://picsum.photos/201/201',
              ),
              Photo(
                photoId: '3',
                originalFilename: 'coding_setup.jpg',
                iv: 'mock_iv',
                capturedAt: DateTime.now(),
                thumbnailUrl: 'https://picsum.photos/202/202',
              ),
            ];
          });
        }
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _uploadPhotos() async {
    final picker = ImagePicker();
    final List<XFile> images = await picker.pickMultiImage();
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
        onProgress: (done, total) {
          setState(() {
            _uploadProgress = done;
            _uploadTotal = total;
          });
        },
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${images.length} photo${images.length == 1 ? '' : 's'} uploaded!')),
        );
        _loadPhotos();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Upload failed: $e'),
            backgroundColor: Colors.red.shade400,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isUploading = false);
    }
  }

  Future<void> _toggleFavorite(Photo photo) async {
    try {
      final newValue = await _photoService.toggleFavorite(photo.photoId);
      setState(() {
        photo.isFavorite = newValue;
        // If in favorites-only mode and we un-favorited, remove from list
        if (_showFavoritesOnly && !newValue) {
          _photos.remove(photo);
        }
      });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update favorite: $e')),
      );
    }
  }

  void _toggleFavoritesFilter() {
    setState(() => _showFavoritesOnly = !_showFavoritesOnly);
    _loadPhotos();
  }

  @override
  Widget build(BuildContext context) {
    return MainWebLayout(
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
        } else {
          setState(() => _selectedIndex = index);
        }
      },
      onLogout: _logout,
      child: Scaffold(
        backgroundColor: AppColors.background,
        floatingActionButton: FloatingActionButton.extended(
          onPressed: _uploadPhotos,
          icon: const Icon(Icons.add_a_photo_outlined),
          label: const Text('Upload'),
          backgroundColor: AppColors.primaryBlue,
        ),
        body: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Toolbar ──────────────────────────────────────────────
              Row(
                children: [
                  Text('Photos', style: AppTextStyles.headline),
                  const SizedBox(width: 16),
                  // Favorites filter chip
                  FilterChip(
                    avatar: Icon(
                      _showFavoritesOnly ? Icons.favorite : Icons.favorite_border,
                      size: 16,
                      color: _showFavoritesOnly ? Colors.white : AppColors.primaryBlue,
                    ),
                    label: Text(
                      'Favorites',
                      style: TextStyle(
                        color: _showFavoritesOnly ? Colors.white : AppColors.primaryBlue,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    selected: _showFavoritesOnly,
                    onSelected: (_) => _toggleFavoritesFilter(),
                    selectedColor: AppColors.primaryBlue,
                    backgroundColor: AppColors.primaryBlue.withOpacity(0.08),
                    checkmarkColor: Colors.white,
                    side: BorderSide(color: AppColors.primaryBlue.withOpacity(0.3)),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // ── Photo Grid ───────────────────────────────────────────
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : _photos.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(
                                  _showFavoritesOnly
                                      ? Icons.favorite_border
                                      : Icons.photo_library_outlined,
                                  size: 64,
                                  color: AppColors.textSlate.withOpacity(0.5),
                                ),
                                const SizedBox(height: 16),
                                Text(
                                  _showFavoritesOnly
                                      ? 'No favorites yet'
                                      : 'No photos yet',
                                  style: AppTextStyles.headline,
                                ),
                                const SizedBox(height: 8),
                                Text(
                                  _showFavoritesOnly
                                      ? 'Tap ♥ on any photo to save it here'
                                      : 'Upload your first encrypted photo',
                                ),
                              ],
                            ),
                          )
                        : GridView.builder(
                            gridDelegate:
                                const SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: 140,
                              childAspectRatio: 1,
                              crossAxisSpacing: 16,
                              mainAxisSpacing: 16,
                            ),
                            itemCount: _photos.length,
                            itemBuilder: (context, index) {
                              final photo = _photos[index];
                              return _PhotoTile(
                                photo: photo,
                                onFavoriteToggle: () => _toggleFavorite(photo),
                              );
                            },
                          ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo tile widget with heart overlay
// ─────────────────────────────────────────────────────────────────────────────
class _PhotoTile extends StatelessWidget {
  final Photo photo;
  final VoidCallback onFavoriteToggle;

  const _PhotoTile({required this.photo, required this.onFavoriteToggle});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.grey.shade200,
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Thumbnail
          if (photo.thumbnailUrl != null)
            Image.network(
              photo.thumbnailUrl!,
              fit: BoxFit.cover,
              errorBuilder: (c, e, s) => const Icon(Icons.broken_image),
            )
          else
            const Icon(Icons.lock, color: AppColors.primaryBlue),

          // Filename bar
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
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

          // Heart button (top-right)
          Positioned(
            top: 6,
            right: 6,
            child: GestureDetector(
              onTap: onFavoriteToggle,
              child: Container(
                padding: const EdgeInsets.all(4),
                decoration: BoxDecoration(
                  color: Colors.black.withOpacity(0.35),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  photo.isFavorite ? Icons.favorite : Icons.favorite_border,
                  size: 18,
                  color: photo.isFavorite ? Colors.red.shade400 : Colors.white,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
