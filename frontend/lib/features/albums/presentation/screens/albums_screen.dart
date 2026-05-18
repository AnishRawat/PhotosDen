import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/network/network_service.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../home/presentation/widgets/main_web_layout.dart';
import '../../data/models/album.dart';
import '../../data/services/album_service.dart';
import '../widgets/album_card.dart';
import '../dialogs/create_album_dialog.dart';
import '../../../../core/utils/toast_utils.dart';

class AlbumsScreen extends StatefulWidget {
  const AlbumsScreen({super.key});

  @override
  State<AlbumsScreen> createState() => _AlbumsScreenState();
}

class _AlbumsScreenState extends State<AlbumsScreen> {
  // Navigation Index 1 = Albums
  int _selectedIndex = 1; 

  bool _isLoading = true;
  List<Album> _albums = [];
  late AlbumService _albumService;
  late AuthService _authService;

  // Selection Mode State
  bool _isSelectionMode = false;
  Set<String> _selectedAlbumIds = {};

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

    _loadAlbums();
  }

  Future<void> _loadAlbums() async {
    setState(() => _isLoading = true);
    try {
      final albums = await _albumService.getAlbums();
      // Sort: Newest first
      albums.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      
      if (mounted) setState(() => _albums = albums);
    } catch (e) {
      if (mounted) {
        ToastUtils.showError(context, 'Failed to load albums: $e');
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _createAlbum() async {
    final name = await showDialog<String>(
      context: context,
      builder: (context) => const CreateAlbumDialog(),
    );

    if (name != null) {
      try {
        final newAlbum = await _albumService.createAlbum(name);
        
        if (mounted) {
           setState(() {
             _albums.insert(0, newAlbum);
           });
           
           // Streamlined flow: No "Success" toast delay, no second dialog.
           // Navigate directly to the new album.
           context.go('/albums/${newAlbum.id}?new=true');
        }
      } on AlbumNameConflictException catch (e) {
        if (mounted) {
          ToastUtils.showError(context, e.message);
        }
      } catch (e) {
        if (mounted) {
           ToastUtils.showError(context, 'Failed to create album');
        }
      }
    }
  }

  void _toggleSelectionMode() {
    setState(() {
      _isSelectionMode = !_isSelectionMode;
      _selectedAlbumIds.clear();
    });
  }

  void _toggleSelection(String albumId) {
    setState(() {
      if (_selectedAlbumIds.contains(albumId)) {
        _selectedAlbumIds.remove(albumId);
      } else {
        _selectedAlbumIds.add(albumId);
      }
    });
  }

  Future<void> _deleteSelectedAlbums() async {
    if (_selectedAlbumIds.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Delete Albums'),
        content: Text('Are you sure you want to delete ${_selectedAlbumIds.length} albums? This action cannot be undone.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Delete'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      // Optimistic or sequential deletion
      // For now, sequential is safer/easier
      int successCount = 0;
      for (final id in _selectedAlbumIds) {
        try {
          await _albumService.deleteAlbum(id);
          successCount++;
        } catch (e) {
          print('Failed to delete album $id: $e');
        }
      }

      if (mounted) {
        setState(() {
          _albums.removeWhere((a) => _selectedAlbumIds.contains(a.id));
          _selectedAlbumIds.clear();
          _isSelectionMode = false; // Exit selection mode after actions
        });
        ToastUtils.showSuccess(context, 'Deleted $successCount albums');
      }
    }
  }

  void _onDestinationSelected(int index) {
    if (index == 0) context.go('/dashboard');
    else if (index == 1) context.go('/albums');
    else if (index == 4) context.go('/wallet');
    else if (index == 5) context.go('/settings');
    else if (index == 6) context.go('/profile');
    else if (index == 7) context.go('/library');
    else setState(() => _selectedIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    return MainWebLayout(
      selectedIndex: _selectedIndex, 
      onDestinationSelected: _onDestinationSelected,
      onLogout: () async {
         await _authService.logout();
         if (mounted) context.go('/signup');
      },
      child: Scaffold(
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        floatingActionButton: _isSelectionMode
            ? FloatingActionButton.extended(
                onPressed: _deleteSelectedAlbums,
                icon: const Icon(Icons.delete_outline),
                label: Text('Delete (${_selectedAlbumIds.length})'),
                backgroundColor: Colors.red,
              )
            : FloatingActionButton.extended(
                onPressed: _createAlbum,
                icon: const Icon(Icons.create_new_folder_outlined),
                label: const Text('New Album'),
                backgroundColor: AppColors.primaryBlue,
              ),
        body: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Albums', style: AppTextStyles.headline),
                  IconButton(
                    onPressed: _toggleSelectionMode,
                    icon: Icon(
                      _isSelectionMode ? Icons.close : Icons.checklist, // Checklist icon for selection
                      color: Theme.of(context).iconTheme.color,
                    ),
                    tooltip: _isSelectionMode ? 'Cancel Selection' : 'Select Albums',
                    // Optional: Use a more prominent button style
                    // style: IconButton.styleFrom(backgroundColor: Colors.grey.shade200),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator())
                    : _albums.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.photo_album_outlined, size: 64, color: Colors.grey.withOpacity(0.5)),
                                const SizedBox(height: 16),
                                const Text(
                                  'No albums yet',
                                  style: TextStyle(fontSize: 18, color: Colors.grey),
                                ),
                                const SizedBox(height: 8),
                                TextButton(
                                  onPressed: _createAlbum,
                                  child: const Text('Create your first album'),
                                )
                              ],
                            ),
                          )
                        : GridView.builder(
                            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                              maxCrossAxisExtent: 160,
                              childAspectRatio: 0.8,
                              crossAxisSpacing: 24,
                              mainAxisSpacing: 24,
                            ),
                            itemCount: _albums.length,
                            itemBuilder: (context, index) {
                              final album = _albums[index];
                              final isSelected = _selectedAlbumIds.contains(album.id);
                              
                              return GestureDetector(
                                onTap: () {
                                  if (_isSelectionMode) {
                                    _toggleSelection(album.id);
                                  } else {
                                    context.go('/albums/${album.id}');
                                  }
                                },
                                onLongPress: () {
                                  if (!_isSelectionMode) {
                                    _toggleSelectionMode();
                                    _toggleSelection(album.id);
                                  }
                                },
                                child: AlbumCard(
                                  album: album,
                                  isSelectionMode: _isSelectionMode,
                                  isSelected: isSelected,
                                ),
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
