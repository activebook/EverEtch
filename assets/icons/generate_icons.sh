#!/bin/bash

# Electron Icon Generator Script
# Usage: ./generate_icons.sh <source_image>
# Example: ./generate_icons.sh icon.svg
#          ./generate_icons.sh icon_512x512.png

set -e  # Exit on any error

# Check if source image is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <source_image>"
    echo "Example: $0 icon.svg"
    echo "         $0 icon_512x512.png"
    exit 1
fi

SOURCE_IMAGE="$1"

# Check if source image exists
if [ ! -f "$SOURCE_IMAGE" ]; then
    echo "Error: Source image '$SOURCE_IMAGE' not found!"
    exit 1
fi

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick is not installed. Please install it first."
    echo "On macOS: brew install imagemagick"
    exit 1
fi

echo "🚀 Generating Electron app icons from '$SOURCE_IMAGE'..."

# Create output directory
OUTPUT_DIR="generated"
mkdir -p "$OUTPUT_DIR"

# Standard sizes for Electron apps
SIZES=(16 24 32 48 64 96 128 256 512 1024)

echo "📱 Creating PNG files at various sizes..."
for size in "${SIZES[@]}"; do
    output_file="$OUTPUT_DIR/icon_${size}x${size}.png"
    magick "$SOURCE_IMAGE" -resize "${size}x${size}" "$output_file"
    echo "  ✅ Created: $output_file"
done

echo "🪟 Creating Windows ICO file..."
magick "$SOURCE_IMAGE" -define icon:auto-resize=256,128,96,64,48,32,16 "$OUTPUT_DIR/icon.ico"
echo "  ✅ Created: $OUTPUT_DIR/icon.ico"

echo "🍎 Creating macOS ICNS file..."
# Create iconset directory
ICONSET_DIR="$OUTPUT_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

# Generate all required sizes for macOS iconset
echo "  📋 Creating iconset files..."
magick "$SOURCE_IMAGE" -resize 16x16 "$ICONSET_DIR/icon_16x16.png"
magick "$SOURCE_IMAGE" -resize 32x32 "$ICONSET_DIR/icon_16x16@2x.png"
magick "$SOURCE_IMAGE" -resize 32x32 "$ICONSET_DIR/icon_32x32.png"
magick "$SOURCE_IMAGE" -resize 64x64 "$ICONSET_DIR/icon_32x32@2x.png"
magick "$SOURCE_IMAGE" -resize 128x128 "$ICONSET_DIR/icon_128x128.png"
magick "$SOURCE_IMAGE" -resize 256x256 "$ICONSET_DIR/icon_128x128@2x.png"
magick "$SOURCE_IMAGE" -resize 256x256 "$ICONSET_DIR/icon_256x256.png"
magick "$SOURCE_IMAGE" -resize 512x512 "$ICONSET_DIR/icon_256x256@2x.png"
magick "$SOURCE_IMAGE" -resize 512x512 "$ICONSET_DIR/icon_512x512.png"
magick "$SOURCE_IMAGE" -resize 1024x1024 "$ICONSET_DIR/icon_512x512@2x.png"

# Convert iconset to icns (check if iconutil is available)
if command -v iconutil &> /dev/null; then
    iconutil -c icns "$ICONSET_DIR" -o "$OUTPUT_DIR/icon.icns"
    echo "  ✅ Created: $OUTPUT_DIR/icon.icns"
else
    echo "  ⚠️  iconutil not found, skipping .icns creation"
    echo "      (iconutil is only available on macOS)"
fi

echo ""
echo "🎉 Icon generation complete!"
echo ""
echo "📁 Generated files in '$OUTPUT_DIR/':"
echo "   • Individual PNG files: icon_16x16.png through icon_1024x1024.png"
echo "   • Windows: icon.ico"
if [ -f "$OUTPUT_DIR/icon.icns" ]; then
    echo "   • macOS: icon.icns"
fi
echo ""
echo "📝 For your Electron build configuration (package.json or electron-builder config):"
echo ""
echo '   "build": {'
echo '     "directories": {'
echo '       "buildResources": "assets/icons"'
echo '     },'
echo '     "mac": {'
echo '       "icon": "generated/icon.icns"'
echo '     },'
echo '     "win": {'
echo '       "icon": "generated/icon.ico"'
echo '     },'
echo '     "linux": {'
echo '       "icon": "generated/icon_512x512.png"'
echo '     }'
echo '   }'
echo ""
