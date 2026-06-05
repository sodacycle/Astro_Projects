#!/usr/bin/env bash
# Run this from the project root (FITS-Metadata-Viewer/).
# It does a clean CMake configure + build, bypassing the
# "manifest still dirty" clock-skew error that occurs when
# ninja sees source timestamps newer than build outputs.

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$PROJECT_DIR/build"

echo "==> Fixing file timestamps to avoid ninja clock-skew..."
# Touch every source file so ninja sees them as up to date
find "$PROJECT_DIR/src" "$PROJECT_DIR/qml" \
     "$PROJECT_DIR/CMakeLists.txt" \
     -type f \( -name "*.cpp" -o -name "*.h" -o -name "*.qml" -o -name "CMakeLists.txt" \) \
     -exec touch {} +

echo "==> Removing stale build directory..."
rm -rf "$BUILD_DIR"

echo "==> Configuring..."
cmake -S "$PROJECT_DIR" -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release

echo "==> Building..."
cmake --build "$BUILD_DIR" --parallel "$(nproc)"

echo ""
echo "==> Done. Run with:"
echo "    $BUILD_DIR/AstroDataViewer"
