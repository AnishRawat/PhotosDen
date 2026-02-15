import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../widgets/landing_content_mobile.dart';
import '../widgets/landing_content_tablet.dart';

class LandingScreen extends StatelessWidget {
  const LandingScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: AppColors.meshGradient,
        ),
        child: LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth > 768) {
              return const LandingContentTablet();
            } else {
              return const LandingContentMobile();
            }
          },
        ),
      ),
    );
  }
}
