import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_text_styles.dart';

enum ToastType { success, error, info }

class CustomToast extends StatelessWidget {
  final String message;
  final ToastType type;
  final VoidCallback? onClose;

  const CustomToast({
    super.key,
    required this.message,
    required this.type,
    this.onClose,
  });

  Color get _backgroundColor {
    switch (type) {
      case ToastType.success:
        return Colors.green.shade50;
      case ToastType.error:
        return Colors.red.shade50;
      case ToastType.info:
        return Colors.blue.shade50;
    }
  }

  Color get _borderColor {
    switch (type) {
      case ToastType.success:
        return Colors.green.shade200;
      case ToastType.error:
        return Colors.red.shade200;
      case ToastType.info:
        return Colors.blue.shade200;
    }
  }

  IconData get _icon {
    switch (type) {
      case ToastType.success:
        return Icons.check_circle_outline;
      case ToastType.error:
        return Icons.error_outline;
      case ToastType.info:
        return Icons.info_outline;
    }
  }

  Color get _iconColor {
    switch (type) {
      case ToastType.success:
        return Colors.green;
      case ToastType.error:
        return Colors.red;
      case ToastType.info:
        return AppColors.primaryBlue;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: _backgroundColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: _borderColor),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(_icon, color: _iconColor),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              message,
              style: AppTextStyles.bodyMedium.copyWith(
                color: Colors.black87,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          if (onClose != null) ...[
            const SizedBox(width: 8),
            GestureDetector(
              onTap: onClose,
              child: const Icon(Icons.close, size: 18, color: Colors.black54),
            ),
          ],
        ],
      ),
    );
  }
}
