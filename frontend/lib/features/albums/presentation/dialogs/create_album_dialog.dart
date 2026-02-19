import 'package:flutter/material.dart';
import '../../../../core/theme/app_colors.dart';

class CreateAlbumDialog extends StatefulWidget {
  const CreateAlbumDialog({super.key});

  @override
  State<CreateAlbumDialog> createState() => _CreateAlbumDialogState();
}

class _CreateAlbumDialogState extends State<CreateAlbumDialog> {
  final _nameController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Create New Album'),
      content: Form(
        key: _formKey,
        child: TextFormField(
          controller: _nameController,
          autofocus: true,
          decoration: InputDecoration(
            labelText: 'Album Name',
            hintText: 'e.g., Summer Trip',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return 'Please enter a name';
            }
            return null;
          },
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancel', style: TextStyle(color: Colors.grey)),
        ),
        ElevatedButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) {
              Navigator.of(context).pop(_nameController.text.trim());
            }
          },
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primaryBlue,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          ),
          child: const Text('Create', style: TextStyle(color: Colors.white)),
        ),
      ],
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    );
  }
}
