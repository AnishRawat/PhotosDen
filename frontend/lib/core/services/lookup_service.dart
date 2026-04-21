import 'dart:convert';
import 'package:http/http.dart' as http;
import '../constants/api_constants.dart';

class LookupService {
  final String _apiBaseUrl;

  LookupService({String? apiBaseUrl}) : _apiBaseUrl = apiBaseUrl ?? ApiConstants.baseUrl;

  /// Fetches the latest dynamic configuration and pricing from the backend.
  Future<Map<String, dynamic>> fetchLookups() async {
    try {
      final response = await http.get(
        Uri.parse('$_apiBaseUrl/lookups'),
        headers: {'Content-Type': 'application/json'},
      );

      if (response.statusCode != 200) {
        throw Exception('Failed to fetch lookups: ${response.statusCode}');
      }

      final json = jsonDecode(response.body);
      
      if (json['success'] == true && json['data'] != null && json['data']['lookups'] != null) {
        return json['data']['lookups'] as Map<String, dynamic>;
      } else {
        throw Exception('Invalid lookup response format');
      }
    } catch (e) {
      throw Exception('Could not connect to pricing service: $e');
    }
  }
}
