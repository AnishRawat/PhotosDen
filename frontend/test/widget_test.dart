import 'package:flutter_test/flutter_test.dart';

import 'package:photosden_frontend/main.dart';

void main() {
  testWidgets('Landing screen loads', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const PhotosDenApp());

    // Verify that the landing screen loads with the headline
    expect(find.text('Your Memories,'), findsOneWidget);
    expect(find.text('Get Started'), findsOneWidget);
  });
}
