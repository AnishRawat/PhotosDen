import 'package:flutter/material.dart';

class PhotoStackWidget extends StatelessWidget {
  const PhotoStackWidget({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 300,
      width: 300,
      child: Stack(
        alignment: Alignment.center,
        children: [
          _buildPhotoCard(
            rotation: -0.15,
            offset: const Offset(-40, 0),
            imageColor: Colors.deepOrange.shade100, // Placeholder color
            imageUrl: 'https://picsum.photos/400/600?random=1',
          ),
          _buildPhotoCard(
            rotation: 0.12,
            offset: const Offset(40, 20),
            imageColor: Colors.teal.shade100, // Placeholder color
             imageUrl: 'https://picsum.photos/400/600?random=2',
          ),
          _buildPhotoCard(
            rotation: 0.0,
            offset: const Offset(0, -20),
            imageColor: Colors.blue.shade100, // Placeholder color
             imageUrl: 'https://picsum.photos/400/600?random=3',
          ),
        ],
      ),
    );
  }

  Widget _buildPhotoCard({
    required double rotation,
    required Offset offset,
    required Color imageColor,
    required String imageUrl,
  }) {
    return Transform.translate(
      offset: offset,
      child: Transform.rotate(
        angle: rotation,
        child: Container(
          width: 160,
          height: 220,
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.15),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          padding: const EdgeInsets.all(6),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.network(
              imageUrl,
              fit: BoxFit.cover,
              errorBuilder: (context, error, stackTrace) {
                return Container(color: imageColor);
              },
              loadingBuilder: (context, child, loadingProgress) {
                 if (loadingProgress == null) return child;
                 return Container(color: imageColor);
              },
            ),
          ),
        ),
      ),
    );
  }
}
