import 'dart:convert';
import 'package:http/http.dart' as http;
import '../constants/api_constants.dart';
import 'secure_storage_service.dart';
import '../../features/wallet/data/models/wallet_model.dart';
import 'auth_service.dart';

class WalletService {
  final SecureStorageService _storageService;
  final AuthService _authService;

  WalletService({
    required SecureStorageService storageService,
    required AuthService authService,
  })  : _storageService = storageService,
        _authService = authService;

  Future<Map<String, String>> _getHeaders() async {
    if (_authService.idToken == null) {
      await _authService.loadSession();
    }
    final token = _authService.idToken;
    if (token == null) {
      throw Exception('Not authenticated. ID Token is missing.');
    }
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    };
  }

  Future<WalletModel> getWalletBalance() async {
    final headers = await _getHeaders();
    final url = Uri.parse('${ApiConstants.baseUrl}${ApiConstants.wallet}');

    final response = await http.get(url, headers: headers);

    if (response.statusCode == 200) {
      final jsonResponse = jsonDecode(response.body);
      if (jsonResponse['success']) {
        return WalletModel.fromJson(jsonResponse['data']);
      } else {
        throw Exception(jsonResponse['error']);
      }
    } else {
      throw Exception('Failed to load wallet balance: ${response.statusCode}');
    }
  }

  Future<List<DepositModel>> getDepositHistory() async {
    final headers = await _getHeaders();
    final url = Uri.parse('${ApiConstants.baseUrl}${ApiConstants.walletDeposits}');

    final response = await http.get(url, headers: headers);

    if (response.statusCode == 200) {
      final jsonResponse = jsonDecode(response.body);
      if (jsonResponse['success']) {
        final List<dynamic> data = jsonResponse['data'];
        return data.map((json) => DepositModel.fromJson(json)).toList();
      } else {
        throw Exception(jsonResponse['error']);
      }
    } else {
      throw Exception('Failed to load deposit history: ${response.statusCode}');
    }
  }

  Future<DepositModel> createDeposit(double amount, {String? notes}) async {
    final headers = await _getHeaders();
    final url = Uri.parse('${ApiConstants.baseUrl}${ApiConstants.walletDeposits}');

    final response = await http.post(
      url,
      headers: headers,
      body: jsonEncode({
        'amount': amount,
        if (notes != null) 'notes': notes,
      }),
    );

    if (response.statusCode == 200) {
      final jsonResponse = jsonDecode(response.body);
      if (jsonResponse['success']) {
        // Build a deposit model from the response
        final data = jsonResponse['data'];
        return DepositModel(
          depositId: data['depositId'],
          amount: (data['amount'] as num).toDouble(),
          status: 'PENDING', // Assuming initial state is pending conceptually, or check response if backend returns it
          createdAt: DateTime.now().millisecondsSinceEpoch,
          notes: notes,
        );
      } else {
        throw Exception(jsonResponse['error']);
      }
    } else {
      throw Exception('Failed to create deposit: ${response.statusCode}');
    }
  }
}
