class ApiConstants {
  // Base URL is dynamically managed based on branching environment (dev/staging/main)
  static const String baseUrl = 'https://g2l2bkihl6.execute-api.ap-south-1.amazonaws.com/dev'; 
  
  static const String signup = '/auth/signup';
  static const String login = '/auth/login';
  static const String uploads = '/uploads';
  static const String wallet = '/wallet';
  static const String walletDeposits = '/wallet/deposits';
}
