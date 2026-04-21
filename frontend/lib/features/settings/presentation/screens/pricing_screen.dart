import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/services/lookup_service.dart';

class PricingScreen extends StatefulWidget {
  const PricingScreen({super.key});

  @override
  State<PricingScreen> createState() => _PricingScreenState();
}

class _PricingScreenState extends State<PricingScreen> {
  late Future<Map<String, dynamic>> _lookupsFuture;
  final _lookupService = LookupService();

  @override
  void initState() {
    super.initState();
    _lookupsFuture = _lookupService.fetchLookups();
  }

  void _retry() {
    setState(() {
      _lookupsFuture = _lookupService.fetchLookups();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      appBar: AppBar(
        backgroundColor: AppColors.surface,
        elevation: 0,
        iconTheme: const IconThemeData(color: AppColors.textDark),
        title: Text('Pricing Estimations', style: AppTextStyles.headline.copyWith(fontSize: 20)),
      ),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _lookupsFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(24.0),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, size: 48, color: Colors.redAccent),
                    const SizedBox(height: 16),
                    Text(
                      'Failed to load pricing data.\n${snapshot.error.toString().replaceAll("Exception: ", "")}',
                      textAlign: TextAlign.center,
                      style: AppTextStyles.bodyMedium,
                    ),
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: _retry,
                      style: ElevatedButton.styleFrom(backgroundColor: AppColors.primaryBlue),
                      child: const Text('Retry', style: TextStyle(color: Colors.white)),
                    ),
                  ],
                ),
              ),
            );
          }

          final lookups = snapshot.data ?? {};
          
          // Helper to safely extract pricing and format as currency
          String getValue(String key, String fallback) {
            if (lookups.containsKey(key)) {
              final val = lookups[key];
              if (val is num) {
                return '₹ ${val.toStringAsFixed(2)}';
              }
              return '₹ $val';
            }
            return fallback;
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Container(
                decoration: BoxDecoration(
                  color: AppColors.surface,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.04),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Column(
                  children: [
                    _PricingItem(
                      title: 'Photo Upload (per MB)',
                      price: getValue('billing.pricing.photoUpload', '₹ 1.00'),
                      icon: Icons.cloud_upload_outlined,
                    ),
                    const Divider(height: 1, indent: 56),
                    _PricingItem(
                      title: 'Photo Download (per MB)',
                      price: getValue('billing.pricing.zipDownload', '₹ 1.50'),
                      icon: Icons.cloud_download_outlined,
                    ),
                    const Divider(height: 1, indent: 56),
                    _PricingItem(
                      title: 'Storage (per GB / month)',
                      price: getValue('billing.pricing.storageGB', '₹ 5.00'),
                      icon: Icons.storage_rounded,
                    ),
                    const Divider(height: 1, indent: 56),
                    _PricingItem(
                      title: 'Photo View',
                      price: getValue('billing.pricing.photoView', '₹ 0.05'),
                      icon: Icons.remove_red_eye_outlined,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppColors.primaryBlue.withOpacity(0.05),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.primaryBlue.withOpacity(0.1)),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, color: AppColors.primaryBlue, size: 20),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        getValue('billing.pricing.note', 'Note: These are estimated prices fetched live from the server. Final pricing may vary slightly based on AWS region costs and includes a small platform margin.'),
                        style: AppTextStyles.label.copyWith(color: AppColors.textSlate, height: 1.4),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _PricingItem extends StatelessWidget {
  final String title;
  final String price;
  final IconData icon;

  const _PricingItem({
    required this.title,
    required this.price,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.primaryBlue.withOpacity(0.1),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, color: AppColors.primaryBlue, size: 24),
      ),
      title: Text(title, style: AppTextStyles.bodyMedium.copyWith(fontWeight: FontWeight.w500)),
      trailing: Text(
        price,
        style: AppTextStyles.bodyMedium.copyWith(
          color: AppColors.primaryBlue,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
