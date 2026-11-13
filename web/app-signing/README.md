# Test-app signing key

`test.keystore` signs the **test** Android builds only (the standard Android debug key format, password `android`).
It is committed on purpose: every GitHub build uses the same key, so a new test APK installs over the old one
instead of failing with "App not installed".

Do **not** use this key for the Google Play release. The release key will be created separately and stored as a
GitHub secret, never in the repository.
