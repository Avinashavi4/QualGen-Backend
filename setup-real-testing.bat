@echo off
echo 🚀 Setting up Real Device Testing Environment
echo.

echo 📱 Checking Android SDK...
where adb >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ ADB found - Android testing ready
    adb devices
) else (
    echo ⚠️  ADB not found - Installing Android SDK...
    echo.
    echo Please install Android SDK or use the following options:
    echo 1. Download Android Studio: https://developer.android.com/studio
    echo 2. Or install SDK tools only: https://developer.android.com/studio/releases/platform-tools
    echo.
    echo After installation, add platform-tools to your PATH:
    echo set PATH=%PATH%;C:\path\to\android-sdk\platform-tools
)

echo.
echo 🎥 Checking video recording tools...
where ffmpeg >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ FFmpeg found - Video processing ready
) else (
    echo ⚠️  FFmpeg not found - For better video processing
    echo Download from: https://ffmpeg.org/download.html
)

echo.
echo 📱 Android Emulator Setup:
echo To use with Android emulators:
echo 1. Start Android Studio
echo 2. Open AVD Manager
echo 3. Create and start an emulator
echo 4. Or use command: emulator -avd YourEmulatorName

echo.
echo 🔧 Alternative: Using real devices
echo 1. Enable Developer Options on your Android device
echo 2. Enable USB Debugging
echo 3. Connect device via USB
echo 4. Accept debugging authorization

echo.
echo 🎯 Current Setup Status:
node -e "
const { execSync } = require('child_process');
try {
  console.log('✅ Node.js:', process.version);
  const adb = execSync('adb version', {encoding: 'utf8'});
  console.log('✅ ADB Version:', adb.split('\n')[0]);
} catch {
  console.log('❌ ADB not available');
}

try {
  const ffmpeg = execSync('ffmpeg -version', {encoding: 'utf8'});
  console.log('✅ FFmpeg Version:', ffmpeg.split('\n')[0]);
} catch {
  console.log('❌ FFmpeg not available');
}
"

echo.
echo 🚀 To test with real devices:
echo 1. Connect Android device or start emulator
echo 2. Visit http://localhost:3002
echo 3. Click "Start Real Device Test"
echo 4. Watch live video recording like BrowserStack!

pause
