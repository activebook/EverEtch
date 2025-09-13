# EverEtch Custom URL Protocol Setup

This document explains how to set up the custom `everetch://` URL protocol on different platforms so that clicking links like `everetch://word/hello` will open EverEtch and navigate to the specified content.

## Supported URL Patterns

- `everetch://` - Opens EverEtch
- `everetch://word/{wordName}` - Opens EverEtch and navigates to a specific word
- `everetch://profile/{profileName}` - Opens EverEtch and switches to a specific profile

## Platform-Specific Setup

### macOS

**✅ Automatic Setup**
The URL protocol is automatically registered when building with electron-builder. The configuration is already set up in `package.json`:

```json
"mac": {
  "extendInfo": {
    "CFBundleURLTypes": [
      {
        "CFBundleURLName": "EverEtch Protocol",
        "CFBundleURLSchemes": ["everetch"]
      }
    ]
  }
}
```

**Manual Setup** (if needed):
1. Locate your EverEtch.app in Finder
2. Right-click and select "Show Package Contents"
3. Navigate to `Contents/Info.plist`
4. Add the following XML before the closing `</dict>` tag:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>EverEtch Protocol</string>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>everetch</string>
    </array>
  </dict>
</array>
```

### Windows

**Manual Setup Required**
Windows requires registry entries to register URL protocols. Use the provided PowerShell script:

1. Open PowerShell as Administrator
2. Navigate to the build directory
3. Run the registration script:

```powershell
# Register the protocol
.\register-protocol.ps1 -AppPath "C:\Path\To\EverEtch.exe"

# Or run without parameters to be prompted for the path
.\register-protocol.ps1

# To unregister
.\register-protocol.ps1 -AppPath "C:\Path\To\EverEtch.exe" -Unregister
```

**Manual Registry Setup** (alternative):
If you prefer to edit the registry directly:

1. Open Registry Editor (regedit)
2. Navigate to `HKEY_CURRENT_USER\Software\Classes`
3. Create a new key named `everetch`
4. Set the default value to `URL:EverEtch Protocol`
5. Create a string value named `URL Protocol` with empty value
6. Create subkey: `everetch\shell\open\command`
7. Set the default value to: `"C:\Path\To\EverEtch.exe" "%1"`

### Linux

**Manual Setup Required**
Linux uses desktop files to register URL handlers:

1. Copy the `everetch.desktop` file to `~/.local/share/applications/`
2. Edit the file and update the `Exec` path to point to your EverEtch AppImage
3. Make sure the file is executable: `chmod +x ~/.local/share/applications/everetch.desktop`
4. Update your desktop database: `update-desktop-database ~/.local/share/applications/`

**Example desktop file content:**
```ini
[Desktop Entry]
Name=EverEtch
Comment=A slim word memo application
Exec=/home/user/Applications/EverEtch.AppImage %u
Icon=everetch
Type=Application
Categories=Office;Education;
MimeType=x-scheme-handler/everetch;
StartupWMClass=EverEtch
```

## Testing

After setup, test the protocol with these URLs:

- Click this link: [everetch://](everetch://) (opens EverEtch)
- Or use these in your browser/command line:
  - `everetch://word/example`
  - `everetch://profile/default`

## Troubleshooting

### macOS
- If links don't work, try rebuilding the app with `npm run dist:mac`
- Check Console.app for any error messages

### Windows
- Make sure you ran the PowerShell script as Administrator
- Check that the registry entries were created correctly
- Try restarting your browser after registration

### Linux
- Ensure the desktop file is in the correct location
- Run `update-desktop-database` after installing
- Check that the AppImage path is correct and executable

### General
- The app must be installed/launched at least once for the protocol to work
- Some browsers may require additional configuration
- If links still don't work, check the app's console/developer tools for errors
