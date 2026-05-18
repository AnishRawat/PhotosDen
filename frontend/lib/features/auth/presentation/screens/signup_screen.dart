import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_text_styles.dart';
import '../../../../core/widgets/fade_in_slide.dart';
import '../../../../core/services/auth_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/crypto_service.dart';
import '../../../../core/services/secure_storage_service.dart';
import '../../../../core/constants/api_constants.dart';
import 'package:go_router/go_router.dart';

class SignUpScreen extends StatefulWidget {
  const SignUpScreen({super.key});

  @override
  State<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends State<SignUpScreen> {
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  bool _isPasswordVisible = false;
  String _passwordStrengthText = '';
  Color _passwordStrengthColor = Colors.grey;
  double _passwordStrength = 0.0;

  void _checkPasswordStrength(String password) {
    double strength = 0.0;
    if (password.isEmpty) {
      strength = 0.0;
    } else {
      // Base requirement: 12+ chars
      if (password.length >= 12) strength += 0.2;
      // Complexity requirements
      if (password.contains(RegExp(r'[A-Z]'))) strength += 0.2;
      if (password.contains(RegExp(r'[a-z]'))) strength += 0.2;
      if (password.contains(RegExp(r'[0-9]'))) strength += 0.2;
      if (password.contains(RegExp(r'[!@#\$&*~]'))) strength += 0.2;
    }

    setState(() {
      _passwordStrength = strength;
      if (strength <= 0.4) {
        _passwordStrengthText = 'Weak';
        _passwordStrengthColor = Colors.red;
      } else if (strength <= 0.8) {
        _passwordStrengthText = 'Fair';
        _passwordStrengthColor = Colors.orange;
      } else {
        _passwordStrengthText = 'Strong';
        _passwordStrengthColor = Colors.green;
      }
    });
  }

  Future<void> _handleSignup() async {
     // Enforce strict policy: Must meet ALL criteria (strength >= 1.0)
     // Or at least length + 3 types = 0.8? User said "minimum length is 12... contain upper, lower, special"
     // Backend might execute this too. Let's aim for perfection.
     if (_passwordController.text.length < 12) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password must be at least 12 characters long.')),
      );
      return;
    }

    if (_passwordStrength < 1.0) {
       ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Password must include uppercase, lowercase, number, and special character.')),
      );
      return;
    }

    setState(() => _isLoading = true);
    
    // ... rest of setup ...
    final crypto = CryptoService();
    final storage = SecureStorageService();
    const apiBaseUrl = ApiConstants.baseUrl; 
    final authService = AuthService(
      cryptoService: crypto,
      storageService: storage,
      apiBaseUrl: apiBaseUrl,
    );

    try {
      final response = await authService.signup(
        name: _nameController.text.trim(),
        email: _emailController.text.trim(),
        password: _passwordController.text,
      );

      if (mounted) {
        if (response.verificationRequired) {
          context.go('/verify-otp', extra: _emailController.text.trim());
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
             const SnackBar(content: Text('Account created! Please login.')),
          );
          context.go('/login');
        }
      }
    } catch (e) {
      print('Signup failed: $e');
      if (mounted) {
        // Clean error message: Remove "Exception: " prefix and duplicates
        String errorMessage = e.toString().replaceAll('Exception: ', '');
        // Sometimes duplicate prefixes occur like "Signup failed: Signup failed: ..."
        if (errorMessage.startsWith('Signup failed: ')) {
             errorMessage = errorMessage.replaceFirst('Signup failed: ', '');
        }

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(errorMessage)),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: AppColors.meshGradient,
        ),
        child: Center(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(24.0),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 450),
                child: Card(
                  elevation: 8,
                  shadowColor: Colors.black26,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
                  child: Padding(
                    padding: const EdgeInsets.all(32.0),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Icon(Icons.person_add_rounded, size: 48, color: AppColors.primaryBlue),
                        const SizedBox(height: 16),
                        Text(
                          'Create Account',
                          textAlign: TextAlign.center,
                          style: AppTextStyles.headline,
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Join PhotosDen today',
                          textAlign: TextAlign.center,
                          style: AppTextStyles.bodyMedium.copyWith(color: Theme.of(context).textTheme.bodySmall?.color),
                        ),
                        const SizedBox(height: 32),
                        // Name Field
                        TextFormField(
                          controller: _nameController,
                          decoration: InputDecoration(
                            labelText: 'Full Name',
                            prefixIcon: const Icon(Icons.person_outline),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        // Email Field
                        TextFormField(
                          controller: _emailController,
                          decoration: InputDecoration(
                            labelText: 'Email',
                            prefixIcon: const Icon(Icons.email_outlined),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),

                        // Password Field
                        TextFormField(
                          controller: _passwordController,
                          obscureText: !_isPasswordVisible,
                          onChanged: _checkPasswordStrength,
                          decoration: InputDecoration(
                            labelText: 'Password',
                            prefixIcon: const Icon(Icons.lock_outline),
                             suffixIcon: IconButton(
                              icon: Icon(_isPasswordVisible ? Icons.visibility : Icons.visibility_off),
                              onPressed: () => setState(() => _isPasswordVisible = !_isPasswordVisible),
                            ),
                            border: OutlineInputBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        // Strength Indicator
                        if (_passwordController.text.isNotEmpty)
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              LinearProgressIndicator(
                                value: _passwordStrength,
                                backgroundColor: Colors.grey[300],
                                color: _passwordStrengthColor,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'Strength: $_passwordStrengthText',
                                style: TextStyle(color: _passwordStrengthColor, fontSize: 12),
                              ),
                              const SizedBox(height: 4),
                              const Text(
                                'Must contain: 12+ chars, uppercase, lowercase, number, symbol.',
                                style: TextStyle(color: Colors.grey, fontSize: 10),
                              )
                            ],
                          ),
                        const SizedBox(height: 24),
                        ElevatedButton(
                          onPressed: _isLoading ? null : _handleSignup,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primaryBlue,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          child: _isLoading 
                              ? const CircularProgressIndicator(color: Colors.white)
                              : const Text(
                                  'Sign Up',
                                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white),
                                ),
                        ),
                        const SizedBox(height: 16),
                        TextButton(
                          onPressed: () => context.go('/login'),
                          child: Text(
                            'Already have an account? Sign In',
                          ),
                        ),
                        const SizedBox(height: 16),
                        // Demo Verify Button
                         TextButton.icon(
                          onPressed: () => context.go('/verify-otp', extra: 'demo@example.com'),
                          icon: const Icon(Icons.bug_report_outlined, size: 18),
                          label: const Text('Debug: Skip to OTP'),
                          style: TextButton.styleFrom(foregroundColor: Colors.grey),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
