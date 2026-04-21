import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

const String _currencyKey = 'selected_currency';

final currencyProvider = NotifierProvider<CurrencyNotifier, String>(CurrencyNotifier.new);

class CurrencyNotifier extends Notifier<String> {
  @override
  String build() {
    _loadCurrency();
    return 'INR';
  }

  Future<void> _loadCurrency() async {
    final prefs = await SharedPreferences.getInstance();
    final savedCurrency = prefs.getString(_currencyKey);
    if (savedCurrency != null) {
      state = savedCurrency;
    }
  }

  Future<void> setCurrency(String currencyCode) async {
    state = currencyCode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_currencyKey, currencyCode);
  }
}
