import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/constants/api_constants.dart';
import '../../../../core/network/network_service.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../data/services/photo_service.dart';
import '../widgets/main_web_layout.dart';

const _kNeverShowRetrievalWarning = 'never_show_retrieval_warning';

class CloudLibraryScreen extends ConsumerStatefulWidget {
  final int selectedIndex;
  final Function(int) onDestinationSelected;
  final VoidCallback onLogout;

  const CloudLibraryScreen({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.onLogout,
  });

  @override
  ConsumerState<CloudLibraryScreen> createState() => _CloudLibraryScreenState();
}

class _CloudLibraryScreenState extends ConsumerState<CloudLibraryScreen>
    with TickerProviderStateMixin {
  // Filter state
  bool _filtersExpanded = false;
  int? _selectedYear;
  int? _selectedMonth;
  int? _selectedDay;
  TimeOfDay? _startTime;
  TimeOfDay? _endTime;

  // Results state
  List<Photo> _results = [];
  bool _isLoading = false;
  bool _hasSearched = false;
  String? _error;

  late PhotoService _photoService;
  bool _servicesReady = false;

  late AnimationController _filterAnimController;
  late Animation<double> _filterAnimation;

  @override
  void initState() {
    super.initState();
    _filterAnimController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _filterAnimation = CurvedAnimation(
      parent: _filterAnimController,
      curve: Curves.easeInOut,
    );
    _initServices();
  }

  @override
  void dispose() {
    _filterAnimController.dispose();
    super.dispose();
  }

  Future<void> _initServices() async {
    final crypto = CryptoService();
    final storage = SecureStorageService();
    final auth = AuthService(
      cryptoService: crypto,
      storageService: storage,
      apiBaseUrl: ApiConstants.baseUrl,
    );
    await auth.loadSession();
    final network = NetworkService(auth);
    _photoService = PhotoService(network, crypto, auth, storage);
    setState(() => _servicesReady = true);
  }

  void _toggleFilters() {
    setState(() => _filtersExpanded = !_filtersExpanded);
    if (_filtersExpanded) {
      _filterAnimController.forward();
    } else {
      _filterAnimController.reverse();
    }
  }

  Future<void> _onSearch() async {
    // Check if user has opted out of the retrieval warning
    final prefs = await SharedPreferences.getInstance();
    final neverShow = prefs.getBool(_kNeverShowRetrievalWarning) ?? false;

    if (!neverShow && mounted) {
      bool neverShowAgain = false;
      final confirmed = await showDialog<bool>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) {
          return StatefulBuilder(
            builder: (ctx, setDialogState) {
              return AlertDialog(
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(20),
                ),
                title: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: Colors.orange.withOpacity(0.1),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.info_outline_rounded,
                          color: Colors.orange, size: 22),
                    ),
                    const SizedBox(width: 12),
                    const Text('Retrieval Cost Notice'),
                  ],
                ),
                content: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Retrieving photos from PhotosDen uses bandwidth from your wallet balance.',
                      style: TextStyle(fontSize: 14, height: 1.5),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'You are charged for every GB of data retrieved. Applying filters helps reduce the amount of data fetched and lowers your cost.',
                      style: TextStyle(fontSize: 14, height: 1.5),
                    ),
                    const SizedBox(height: 16),
                    TextButton.icon(
                      onPressed: () => context.push('/pricing'),
                      icon: const Icon(Icons.open_in_new, size: 14),
                      label: const Text('View Pricing Details'),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Checkbox(
                          value: neverShowAgain,
                          activeColor: AppColors.primaryBlue,
                          onChanged: (v) =>
                              setDialogState(() => neverShowAgain = v ?? false),
                        ),
                        const Expanded(
                          child: Text(
                            "Don't show this again",
                            style: TextStyle(fontSize: 13),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Cancel'),
                  ),
                  ElevatedButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primaryBlue,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8),
                      ),
                    ),
                    child: const Text('Retrieve Photos'),
                  ),
                ],
              );
            },
          );
        },
      );

      if (confirmed != true) return;
      if (neverShowAgain) {
        await prefs.setBool(_kNeverShowRetrievalWarning, true);
      }
    }

    await _fetchPhotos();
  }

  Future<void> _fetchPhotos() async {
    if (!_servicesReady) return;
    setState(() {
      _isLoading = true;
      _error = null;
      _hasSearched = true;
    });
    try {
      final photos = await _photoService.getPhotos();
      // Client-side date filter (server-side filtering can be added later)
      final filtered = photos.where((p) {
        if (p.capturedAt == null) return true;
        final d = p.capturedAt!;
        if (_selectedYear != null && d.year != _selectedYear) return false;
        if (_selectedMonth != null && d.month != _selectedMonth) return false;
        if (_selectedDay != null && d.day != _selectedDay) return false;
        return true;
      }).toList();
      setState(() => _results = filtered);
    } catch (e) {
      setState(() => _error = 'Failed to retrieve photos: $e');
    } finally {
      setState(() => _isLoading = false);
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
        body: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header ─────────────────────────────────────────────
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Library', style: AppTextStyles.headline),
                      Text(
                        'Your encrypted photos stored in PhotosDen',
                        style: AppTextStyles.bodyMedium.copyWith(
                          fontSize: 12,
                          color: Theme.of(context).textTheme.bodySmall?.color,
                        ),
                      ),
                    ],
                  ),
                  const Spacer(),
                  // Pricing link
                  TextButton.icon(
                    onPressed: () => context.push('/pricing'),
                    icon: const Icon(Icons.currency_rupee, size: 16),
                    label: const Text('View Pricing'),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.primaryBlue,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),

              // ── Collapsible Filters ─────────────────────────────────
              _buildFilterHeader(),
              SizeTransition(
                sizeFactor: _filterAnimation,
                child: _buildFilterBody(),
              ),
              const SizedBox(height: 12),

              // ── Search Button ───────────────────────────────────────
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _isLoading ? null : _onSearch,
                  icon: _isLoading
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            color: Colors.white,
                            strokeWidth: 2,
                          ),
                        )
                      : const Icon(Icons.cloud_download_outlined),
                  label: Text(_isLoading ? 'Retrieving...' : 'Retrieve Photos'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryBlue,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // ── Results ─────────────────────────────────────────────
              Expanded(child: _buildResults()),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFilterHeader() {
    return InkWell(
      onTap: _toggleFilters,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: Theme.of(context).dividerColor.withOpacity(0.5),
          ),
        ),
        child: Row(
          children: [
            Icon(Icons.filter_list_rounded, size: 18, color: AppColors.primaryBlue),
            const SizedBox(width: 8),
            Text('Date Filters', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(width: 8),
            // Active filter badges
            if (_selectedYear != null)
              _FilterBadge(label: '$_selectedYear'),
            if (_selectedMonth != null)
              _FilterBadge(label: _monthName(_selectedMonth!)),
            if (_selectedDay != null)
              _FilterBadge(label: 'Day $_selectedDay'),
            const Spacer(),
            if (_selectedYear != null || _selectedMonth != null || _selectedDay != null)
              TextButton(
                onPressed: () => setState(() {
                  _selectedYear = null;
                  _selectedMonth = null;
                  _selectedDay = null;
                }),
                style: TextButton.styleFrom(
                  padding: EdgeInsets.zero,
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: Text('Clear', style: TextStyle(fontSize: 12, color: Colors.red.shade400)),
              ),
            const SizedBox(width: 8),
            AnimatedRotation(
              turns: _filtersExpanded ? 0.5 : 0,
              duration: const Duration(milliseconds: 300),
              child: const Icon(Icons.keyboard_arrow_down, size: 20),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterBody() {
    final currentYear = DateTime.now().year;
    final years = List.generate(10, (i) => currentYear - i);

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor.withOpacity(0.5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Year
          Text('Year', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: years.map((y) => _ChoiceChip(
              label: '$y',
              selected: _selectedYear == y,
              onSelected: () => setState(() => _selectedYear = _selectedYear == y ? null : y),
            )).toList(),
          ),
          const SizedBox(height: 16),

          // Month
          Text('Month', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: List.generate(12, (i) => _ChoiceChip(
              label: _monthName(i + 1),
              selected: _selectedMonth == i + 1,
              onSelected: () => setState(() => _selectedMonth = _selectedMonth == i + 1 ? null : i + 1),
            )),
          ),
          const SizedBox(height: 16),

          // Day
          Text('Day', style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w600, fontSize: 13)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: List.generate(31, (i) => _ChoiceChip(
              label: '${i + 1}',
              selected: _selectedDay == i + 1,
              onSelected: () => setState(() => _selectedDay = _selectedDay == i + 1 ? null : i + 1),
            )),
          ),
        ],
      ),
    );
  }

  Widget _buildResults() {
    if (!_hasSearched) {
      // Empty watermark state
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              alignment: Alignment.center,
              children: [
                Icon(
                  Icons.cloud_outlined,
                  size: 120,
                  color: Theme.of(context).iconTheme.color?.withOpacity(0.06),
                ),
                Icon(
                  Icons.photo_library_outlined,
                  size: 56,
                  color: Theme.of(context).iconTheme.color?.withOpacity(0.2),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Text(
              'Your Library Awaits',
              style: AppTextStyles.headline.copyWith(
                color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.5),
                fontSize: 22,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Use the filters above to narrow down your photos,\nthen tap "Retrieve Photos" to load them from the cloud.',
              style: AppTextStyles.bodyMedium.copyWith(
                color: Theme.of(context).textTheme.bodySmall?.color,
                fontSize: 13,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            OutlinedButton.icon(
              onPressed: () => context.push('/pricing'),
              icon: const Icon(Icons.info_outline, size: 16),
              label: const Text('Learn about retrieval costs'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.primaryBlue,
                side: BorderSide(color: AppColors.primaryBlue.withOpacity(0.5)),
              ),
            ),
          ],
        ),
      );
    }

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 48, color: Colors.red.shade400),
            const SizedBox(height: 12),
            Text(_error!, style: AppTextStyles.bodyMedium, textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(onPressed: _onSearch, child: const Text('Retry')),
          ],
        ),
      );
    }

    if (_results.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.search_off_rounded, size: 64, color: Theme.of(context).iconTheme.color?.withOpacity(0.3)),
            const SizedBox(height: 12),
            Text('No photos found for the selected filters', style: AppTextStyles.bodyMedium),
          ],
        ),
      );
    }

    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 140,
        childAspectRatio: 1,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
      ),
      itemCount: _results.length,
      itemBuilder: (context, index) {
        final photo = _results[index];
        return _LibraryPhotoTile(photo: photo);
      },
    );
  }

  String _monthName(int month) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[month - 1];
  }
}

// ─────────────────────────────────────────────────────────
// Reusable chip
// ─────────────────────────────────────────────────────────
class _ChoiceChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onSelected;

  const _ChoiceChip({
    required this.label,
    required this.selected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onSelected,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: selected ? AppColors.primaryBlue : Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppColors.primaryBlue : Theme.of(context).dividerColor,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
            color: selected ? Colors.white : Theme.of(context).textTheme.bodyMedium?.color,
          ),
        ),
      ),
    );
  }
}

// Active filter badge
class _FilterBadge extends StatelessWidget {
  final String label;
  const _FilterBadge({required this.label});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.primaryBlue.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        label,
        style: const TextStyle(fontSize: 11, color: AppColors.primaryBlue, fontWeight: FontWeight.w600),
      ),
    );
  }
}

// Photo tile for library results
class _LibraryPhotoTile extends StatelessWidget {
  final Photo photo;
  const _LibraryPhotoTile({required this.photo});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark
            ? Colors.grey.shade800
            : Colors.grey.shade200,
        borderRadius: BorderRadius.circular(12),
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
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
  }
}
