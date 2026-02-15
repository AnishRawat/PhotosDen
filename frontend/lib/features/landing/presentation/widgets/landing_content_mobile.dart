import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/fade_in_slide.dart';
import 'feature_card.dart';
import 'photo_stack_widget.dart';

import 'package:go_router/go_router.dart';

class LandingContentMobile extends StatelessWidget {
  const LandingContentMobile({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Header
              const FadeInSlide(
                duration: Duration(milliseconds: 600),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(
                      children: [
                        Icon(Icons.camera_rounded, color: AppColors.primaryBlue, size: 28),
                        SizedBox(width: 8),
                        Text('PhotosDen', style: TextStyle(
                          fontFamily: 'Outfit',
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: AppColors.textDark,
                        )),
                      ],
                    ),
                    Icon(Icons.menu_rounded, color: AppColors.textDark),
                  ],
                ),
              ),
              const SizedBox(height: 48),

              // Headline
              FadeInSlide(
                duration: const Duration(milliseconds: 700),
                delay: const Duration(milliseconds: 200),
                child: Text(
                  'Your Memories,\nBeautifully Shared',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.display,
                ),
              ),
              const SizedBox(height: 16),
              FadeInSlide(
                duration: const Duration(milliseconds: 700),
                delay: const Duration(milliseconds: 400),
                child: Text(
                  'Create stunning galleries and share your best moments with ease.',
                  textAlign: TextAlign.center,
                  style: AppTextStyles.bodyLarge,
                ),
              ),
              const SizedBox(height: 48),

              // Photo Stack
              const FadeInSlide(
                duration: Duration(milliseconds: 800),
                delay: Duration(milliseconds: 600),
                child: PhotoStackWidget(),
              ),
              const SizedBox(height: 48),

              // CTA Button
              FadeInSlide(
                duration: const Duration(milliseconds: 700),
                delay: const Duration(milliseconds: 800),
                child: ElevatedButton(
                  onPressed: () => context.go('/signup'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 16),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(30),
                    ),
                  ),
                  child: Text('Get Started', style: AppTextStyles.button),
                ),
              ),
              const SizedBox(height: 64),

              // Features
              FadeInSlide(
                duration: const Duration(milliseconds: 800),
                delay: const Duration(milliseconds: 1000),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    FeatureCard(icon: Icons.auto_awesome, label: 'Smart\nSorting'),
                    FeatureCard(icon: Icons.shield_outlined, label: 'Secure\nStorage'),
                    FeatureCard(icon: Icons.share_outlined, label: 'Easy\nSharing'),
                  ],
                ),
              ),
              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}
