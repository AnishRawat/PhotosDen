import 'package:dio/dio.dart';
import '../constants/api_constants.dart';
import '../services/auth_service.dart';

class NetworkService {
  final Dio _dio;
  final AuthService _authService;

  NetworkService(this._authService)
      : _dio = Dio(BaseOptions(
          baseUrl: ApiConstants.baseUrl,
          connectTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
          headers: {'Content-Type': 'application/json'},
        )) {
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = _authService.idToken;
        if (token != null) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        
        // Add Correlation ID if needed
        options.headers['x-correlation-id'] = DateTime.now().millisecondsSinceEpoch.toString();
        
        return handler.next(options);
      },
      onError: (DioException e, handler) {
        // Handle global errors (e.g., 401 Unauthorized -> Logout)
        if (e.response?.statusCode == 401) {
          // TODO: Trigger logout or refresh token
        }
        return handler.next(e);
      },
    ));
  }

  Dio get dio => _dio;
}
