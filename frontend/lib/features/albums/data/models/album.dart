class Album {
  final String id;
  final String name;
  final String? coverPhotoUrl;
  final int photoCount;
  final DateTime createdAt;

  Album({
    required this.id,
    required this.name,
    this.coverPhotoUrl,
    this.photoCount = 0,
    required this.createdAt,
  });

  factory Album.fromJson(Map<String, dynamic> json) {
    return Album(
      id: json['albumId'] ?? json['id'] ?? '',
      name: json['title'] ?? json['name'] ?? 'Untitled Album',
      coverPhotoUrl: json['coverPhotoUrl'],
      photoCount: json['photoCount'] ?? 0,
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'coverPhotoUrl': coverPhotoUrl,
      'photoCount': photoCount,
      'createdAt': createdAt.toIso8601String(),
    };
  }
}

/// Represents a photo that belongs to an album.
class AlbumPhoto {
  final String photoId;
  final String? thumbnailUrl;
  final String originalFilename;
  final String? addedAt;

  AlbumPhoto({
    required this.photoId,
    this.thumbnailUrl,
    this.originalFilename = '',
    this.addedAt,
  });

  factory AlbumPhoto.fromJson(Map<String, dynamic> json) {
    return AlbumPhoto(
      photoId: json['photoId'] ?? '',
      thumbnailUrl: json['thumbnailDownloadUrl'] ?? json['thumbnailUrl'],
      originalFilename: json['originalFilename'] ?? '',
      addedAt: json['addedAt'],
    );
  }
}

