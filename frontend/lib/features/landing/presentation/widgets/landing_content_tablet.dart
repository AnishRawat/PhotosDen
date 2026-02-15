import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/fade_in_slide.dart';
import 'photo_stack_widget.dart';

import 'package:go_router/go_router.dart';

class LandingContentTablet extends StatelessWidget {
  const LandingContentTablet({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // Top Navigation
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 48, vertical: 24),
          decoration: BoxDecoration(
            color: AppColors.background.withValues(alpha: 0.8),
            border: Border(bottom: BorderSide(color: Colors.grey.shade200)),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
               Row(
                  children: [
                    Icon(Icons.camera_rounded, color: AppColors.primaryBlue, size: 28),
                    const SizedBox(width: 8),
                    Text('PhotosDen', style: AppTextStyles.headline.copyWith(fontSize: 24)),
                  ],
                ),
              Row(
                children: [
                  TextButton(onPressed: () {}, child: Text('Features', style: AppTextStyles.bodyMedium)),
                  const SizedBox(width: 24),
                  TextButton(onPressed: () {}, child: Text('Gallery', style: AppTextStyles.bodyMedium)),
                  const SizedBox(width: 24),
                  TextButton(onPressed: () {}, child: Text('Pricing', style: AppTextStyles.bodyMedium)),
                  const SizedBox(width: 32),
                  ElevatedButton(
                    onPressed: () => context.go('/login'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      textStyle: AppTextStyles.button.copyWith(fontSize: 14),
                    ),
                    child: const Text('Sign In'),
                  ),
                ],
              ),
            ],
          ),
        ),
        
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 64.0),
            child: Row(
              children: [
                // Left Content
                Expanded(
                  flex: 5,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      FadeInSlide(
                        duration: const Duration(milliseconds: 700),
                        child: Text(
                          'Your Memories,\nBeautifully Shared.',
                          style: AppTextStyles.display,
                        ),
                      ),
                      const SizedBox(height: 24),
                      FadeInSlide(
                        duration: const Duration(milliseconds: 700),
                        delay: const Duration(milliseconds: 200),
                        child: Text(
                          'Organize, preserve, and share your most cherished moments with elegance and ease.\nExperience photo sharing reimagined for a premium and trustworthy experience.',
                          style: AppTextStyles.bodyLarge,
                        ),
                      ),
                      const SizedBox(height: 48),
                      FadeInSlide(
                        duration: const Duration(milliseconds: 700),
                        delay: const Duration(milliseconds: 400),
                        child: ElevatedButton(
                          onPressed: () => context.go('/signup'),
                          style: ElevatedButton.styleFrom(
                            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
                          ),
                          child: const Text('Get Started'),
                        ),
                      ),
                    ],
                  ),
                ),
                
                // Right Content (Image)
                Expanded(
                  flex: 5,
                  child: Center(
                    child: FadeInSlide(
                      duration: const Duration(milliseconds: 800),
                      delay: const Duration(milliseconds: 300),
                      beginOffset: const Offset(0.1, 0), // Slide from right slightly
                      child: Transform.scale(
                        scale: 1.2,
                        child: const PhotoStackWidget(),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
