class Album {
  final String id; // Maps to 'albumId' from backend
  final String name; // Maps to 'title' from backend
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
      // Handle both 'albumId' (backend) and 'id' (legacy/frontend model)
      id: json['albumId'] ?? json['id'] ?? '',
      // Handle 'title' (backend) and 'name' (legacy/frontend model)
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
