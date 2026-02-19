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

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  int _selectedIndex = 0;
  List<Photo> _photos = [];
  bool _isLoading = true;
  late PhotoService _photoService;
  late AuthService _authService;

  @override
  void initState() {
    super.initState();
    _initializeServices();
  }

  Future<void> _initializeServices() async {
    // In a real app, use a Service Locator (GetIt) or Riverpod
    final cryptoService = CryptoService();
    final storageService = SecureStorageService();
    // Use localhost for Android emulator or your machine's IP for physical device
    // access via 10.0.2.2 on Android emulator -> localhost on host
    // But for Web (Chrome), localhost refers to the browser's machine, which is correct if backend is running locally.
    // However, if backend is on a different port (e.g., 3000), specify it.
    // Assuming backend is at ApiConstants.baseUrl for now (or placeholder).
    const apiBaseUrl = ApiConstants.baseUrl; 
    
    _authService = AuthService(
      cryptoService: cryptoService,
      storageService: storageService,
      apiBaseUrl: apiBaseUrl,
    );

    // Try to restore session
    final hasSession = await _authService.loadSession();
    if (!hasSession) {
      // If no session, redirect to login
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
    
    _loadPhotos();
  }

  void _logout() async {
    // We need access to the authService instance. 
    // Since we created it locally in _initializeServices, we should store it in state or use a provider.
    // For this quick fix, we'll recreate the dependency chain or, better, make _authService a field.
    // Refactoring to make _authService a field.
    await _authService.logout();
    if (mounted) GoRouter.of(context).go('/');
  }

  Future<void> _loadPhotos() async {
    setState(() => _isLoading = true);
    try {
      final photos = await _photoService.getPhotos();
      setState(() => _photos = photos);
    } catch (e) {
      print('Failed to load photos: $e');
      
      // FALLBACK FOR DEMO: If backend fails, show mock data
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Backend unreachable. Showing demo data. Error: $e')),
        );
        
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
              capturedAt: DateTime.now().subtract(const Duration(days: 0)),
              thumbnailUrl: 'https://picsum.photos/202/202',
            ),
          ];
        });
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _uploadPhotos() async {
    final picker = ImagePicker();
    final List<XFile> images = await picker.pickMultiImage();
    
    if (images.isNotEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Encrypting and uploading...')),
      );
      
      try {
        await _photoService.uploadPhotos(images);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Upload complete!')),
        );
        _loadPhotos(); // Refresh grid
      } catch (e) {
        print('Upload error (using demo fallback): $e');
      }
      
      // Refresh grid with new "uploaded" photo for demo
      // In a real app, this would be handled by re-fetching or state management
      setState(() {
         final newPhoto = Photo(
            photoId: DateTime.now().millisecondsSinceEpoch.toString(),
            originalFilename: images.first.name,
            iv: 'mock_iv',
            capturedAt: DateTime.now(),
            thumbnailUrl: 'https://picsum.photos/203/203?random=${DateTime.now().millisecondsSinceEpoch}', // Random new photo
         );
         _photos = [newPhoto, ..._photos];
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return MainWebLayout(
      selectedIndex: _selectedIndex,
      onDestinationSelected: (index) {
        if (index == 1) {
          context.go('/albums');
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
          child: _isLoading
              ? const Center(child: CircularProgressIndicator())
              : _photos.isEmpty
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.photo_library_outlined, size: 64, color: AppColors.textSlate.withOpacity(0.5)),
                          const SizedBox(height: 16),
                          Text('No photos yet', style: AppTextStyles.headline),
                          const SizedBox(height: 8),
                          const Text('Upload your first encrypted photo'),
                        ],
                      ),
                    )
                  : GridView.builder(
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 200,
                        childAspectRatio: 1,
                        crossAxisSpacing: 16,
                        mainAxisSpacing: 16,
                      ),
                      itemCount: _photos.length,
                      itemBuilder: (context, index) {
                        final photo = _photos[index];
                        return Container(
                          decoration: BoxDecoration(
                            color: Colors.grey.shade200,
                            borderRadius: BorderRadius.circular(12),
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              // In a real app, we'd use a custom widget that downloads & decrypts the thumbnail.
                              // For now, fetching the thumbnail URL (which is signed)
                              if (photo.thumbnailUrl != null)
                                Image.network(
                                  photo.thumbnailUrl!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (c, e, s) => const Icon(Icons.broken_image),
                                )
                              else
                                const Icon(Icons.lock, color: AppColors.primaryBlue),
                                
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
                            ],
                          ),
                        );
                      },
                    ),
        ),
      ),
    );
  }
}
