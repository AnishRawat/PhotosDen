class AppStrings {
  // Wallet / Upload Warnings
  static const String walletEmptyWarningTitle = 'Wallet Empty';
  static const String walletEmptyWarningBody = 'Your wallet is empty. The upload will still work, but you will need credits or wallet money to view these images later. Do you want to proceed?';
  static const String proceed = 'Proceed';
  static const String cancel = 'Cancel';

  // Upload Messages
  static String uploadSuccess(int count) => '$count photo${count == 1 ? '' : 's'} uploaded!';
  static const String uploadFailed = 'Upload failed: ';

  // Photo / Album Loading
  static const String failedToLoadAlbum = 'Failed to load album';
  static const String failedToLoadPhotos = 'Could not load photos: ';
  static const String failedToUpdateFavorite = 'Could not update favorite: ';

  // Generic
  static const String genericError = 'An error occurred. Please try again.';
}
