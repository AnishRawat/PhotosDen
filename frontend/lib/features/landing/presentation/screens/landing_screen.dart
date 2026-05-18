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
        decoration: BoxDecoration(
          gradient: Theme.of(context).brightness == Brightness.light ? AppColors.meshGradient : null,
          color: Theme.of(context).brightness == Brightness.dark ? Theme.of(context).scaffoldBackgroundColor : null,
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
