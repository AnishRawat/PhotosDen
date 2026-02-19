import 'package:flutter/material.dart';
import '../widgets/custom_toast.dart';

class ToastUtils {
  static void showSuccess(BuildContext context, String message) {
    _showToast(context, message, ToastType.success);
  }

  static void showError(BuildContext context, String message) {
    _showToast(context, message, ToastType.error);
  }

  static void showInfo(BuildContext context, String message) {
    _showToast(context, message, ToastType.info);
  }

  static void _showToast(BuildContext context, String message, ToastType type) {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: CustomToast(message: message, type: type),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Colors.transparent,
        elevation: 0,
        margin: const EdgeInsets.all(24),
        duration: const Duration(seconds: 4),
      ),
    );
  }
}
