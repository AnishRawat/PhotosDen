import 'package:dio/dio.dart';
import '../../../../core/network/network_service.dart';
import '../models/album.dart';

class AlbumService {
  final NetworkService _networkService;

  AlbumService(this._networkService);

  /// Fetch all albums for the current user
  Future<List<Album>> getAlbums() async {
    try {
      final response = await _networkService.dio.get('/albums');
      
      // Backend returns { "items": [...] }
      final items = response.data['items'] as List?;
      if (items == null) return [];

      return items
          .map((e) => Album.fromJson(e))
          .toList();
    } catch (e) {
      print('Error fetching albums: $e');
      throw Exception('Failed to load albums');
    }
  }

  /// Fetch a specific album by ID
  Future<Album> getAlbum(String albumId) async {
    try {
      final response = await _networkService.dio.get('/albums/$albumId');
      return Album.fromJson(response.data);
    } catch (e) {
      print('Error fetching album details: $e');
      throw Exception('Failed to load album details');
    }
  }

  /// Create a new album. Throws [AlbumNameConflictException] if name already exists.
  Future<Album> createAlbum(String name) async {
    try {
      final response = await _networkService.dio.post(
        '/albums', 
        data: {
          'title': name,
          'description': '',
        }
      );
      return Album.fromJson(response.data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        throw AlbumNameConflictException(
          e.response?.data?['message'] ?? 'An album with this name already exists',
        );
      }
      print('Error creating album: $e');
      throw Exception('Failed to create album');
    } catch (e) {
      print('Error creating album: $e');
      throw Exception('Failed to create album');
    }
  }

  /// Delete an album
  Future<void> deleteAlbum(String albumId) async {
    try {
      await _networkService.dio.delete('/albums/$albumId');
    } catch (e) {
      print('Error deleting album: $e');
      throw Exception('Failed to delete album');
    }
  }

  /// Fetch all photos in an album
  Future<List<AlbumPhoto>> getAlbumPhotos(String albumId) async {
    try {
      final response = await _networkService.dio.get('/albums/$albumId/photos');
      final items = response.data['items'] as List? ?? [];
      return items.map((e) => AlbumPhoto.fromJson(e)).toList();
    } catch (e) {
      print('Error fetching album photos: $e');
      throw Exception('Failed to load album photos');
    }
  }
}

/// Thrown when a user tries to create an album with a name that already exists.
class AlbumNameConflictException implements Exception {
  final String message;
  AlbumNameConflictException(this.message);

  @override
  String toString() => message;
}
