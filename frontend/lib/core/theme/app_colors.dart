import 'package:flutter/material.dart';

class AppColors {
  // Private constructor to prevent instantiation
  const AppColors._();

  // Primary Colors
  static const Color primaryBlue = Color(0xFF4169E1); // Royal Blue
  static const Color primaryDark = Color(0xFF2B4BBF);

  // Background Colors
  static const Color background = Color(0xFFF8F9FA); // Off-white
  static const Color surface = Colors.white;

  // Text Colors
  static const Color textDark = Color(0xFF333333);
  static const Color textSlate = Color(0xFF64748B);
  static const Color textLight = Colors.white;

  // Gradients
  static const LinearGradient meshGradient = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    colors: [
      Color(0xFFE0E7FF), // Very soft blue/purple
      Color(0xFFF8F9FA), // Fade to background
    ],
    stops: [0.0, 0.4],
  );
  
  static const LinearGradient primaryGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      primaryBlue,
      Color(0xFF5C7CF2),
    ],
  );
}
