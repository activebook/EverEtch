# Atom-Updater

A robust, cross-platform Go application designed to safely update other applications that cannot update themselves while running. It provides atomic file replacement with rollback capabilities.

## Features

- **🔄 Atomic File Replacement**: All-or-nothing file replacement with automatic rollback
- **🛡️ Robust Error Handling**: Comprehensive logging and graceful failure handling
- **🌐 Cross-Platform**: Works on Windows, macOS, and Linux
- **⚡ Simple Integration**: Clean CLI interface with easy-to-parse version output
- **🔒 Safe Operations**: Process monitoring and file validation

## Installation

### Download Pre-built Binaries

Download the latest release for your platform from the [releases page](https://github.com/activebook/atom-updater/releases).

## Usage

### Version Information

```bash
./atom-updater --version
# Output: 1.0.0
```

### Update Application

```bash
./atom-updater <pid> <current_path> <new_path>
```

**Parameters:**

- `<pid>`: Process ID to wait for exit
- `<current_path>`: Path to current application file
- `<new_path>`: Path to new application file

**Examples:**

```bash
# Relative paths
./atom-updater 12345 ./MyApp.exe ./updates/NewApp.exe

# Absolute paths
./atom-updater 12345 /Applications/MyApp.app /tmp/NewApp.app

# Windows
./atom-updater 1234 C:\Program Files\MyApp\app.exe D:\updates\app.exe
```

### Help

```bash
./atom-updater --help
```

## How It Works

1. **Wait**: Monitors the target process PID until it exits
2. **Backup**: Moves current application to temporary file (`.tmp` suffix)
3. **Replace**: Copies new version to intermediate file (`.new` suffix)
4. **Atomic Move**: Moves intermediate file to final location
5. **Launch**: Starts the updated application
6. **Cleanup**: Removes backup file after successful launch

If any step fails, the updater automatically rolls back to the previous version.

## Integration Example

### Target Application (Electron Example)

```javascript
const { spawn } = require('child_process');
const path = require('path');

// Check updater version
function checkUpdaterVersion() {
  return new Promise((resolve, reject) => {
    const updaterPath = path.join(__dirname, 'atom-updater');
    const child = spawn(updaterPath, ['--version'], { stdio: 'pipe' });

    let version = '';
    child.stdout.on('data', (data) => {
      version += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(version.trim());
      } else {
        reject(new Error(`Updater check failed with code ${code}`));
      }
    });
  });
}

// Update application
function updateApplication(newVersionPath) {
  const currentPid = process.pid;
  const currentPath = process.execPath;
  const updaterPath = path.join(__dirname, 'atom-updater');

  // Exit current app and let updater handle the rest
  spawn(updaterPath, [currentPid.toString(), currentPath, newVersionPath], {
    detached: true,
    stdio: 'inherit'
  });

  app.quit();
}
```

### Supported Platforms

- **Windows**: `amd64`, `386`
- **macOS**: `amd64`, `arm64` (Apple Silicon)
- **Linux**: `amd64`, `arm64`, `386`

## Development

### Prerequisites

- Go 1.21 or later
- Git

## Configuration

The application requires no configuration files. All parameters are passed via command-line arguments.
