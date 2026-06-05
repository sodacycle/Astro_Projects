#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# build-appimage.sh — Build a portable AppImage of FITS Metadata Viewer
# Usage:  bash build-appimage.sh [--skip-build]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build-release"
APPDIR="$SCRIPT_DIR/AppDir"
TOOLS_DIR="$SCRIPT_DIR/tools"
BINARY_NAME="AstroDataViewer"
ARCH="$(uname -m)"

SKIP_BUILD=false
for arg in "$@"; do [[ "$arg" == "--skip-build" ]] && SKIP_BUILD=true; done

info()    { echo -e "\e[1;34m==> $*\e[0m"; }
success() { echo -e "\e[1;32m==> $*\e[0m"; }
die()     { echo -e "\e[1;31mERROR: $*\e[0m" >&2; exit 1; }

download() {
    local url="$1" dest="$2"
    if [[ -f "$dest" ]]; then info "Cached: $(basename "$dest")"; return; fi
    info "Downloading $(basename "$dest")..."
    curl -fsSL --progress-bar -o "$dest" "$url" || die "Failed to download $url"
    chmod +x "$dest"
}

# ── Download tools ────────────────────────────────────────────────────────────
mkdir -p "$TOOLS_DIR"
LINUXDEPLOY="$TOOLS_DIR/linuxdeploy-${ARCH}.AppImage"
LINUXDEPLOY_QT="$TOOLS_DIR/linuxdeploy-plugin-qt-${ARCH}.AppImage"
APPIMAGETOOL="$TOOLS_DIR/appimagetool-${ARCH}.AppImage"

download "https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-${ARCH}.AppImage"            "$LINUXDEPLOY"
download "https://github.com/linuxdeploy/linuxdeploy-plugin-qt/releases/download/continuous/linuxdeploy-plugin-qt-${ARCH}.AppImage" "$LINUXDEPLOY_QT"
download "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-${ARCH}.AppImage"             "$APPIMAGETOOL"

# Symlink plugin so linuxdeploy finds it by the expected bare name
[[ -f "$TOOLS_DIR/linuxdeploy-plugin-qt" ]] || \
    ln -sf "linuxdeploy-plugin-qt-${ARCH}.AppImage" "$TOOLS_DIR/linuxdeploy-plugin-qt"

export PATH="$TOOLS_DIR:$PATH"

# ── FIX 1: Find qmake6 explicitly — never use plain qmake (may be Qt5) ────────
info "Locating qmake6..."
QMAKE6=""
for candidate in \
    "$(command -v qmake6 2>/dev/null)" \
    /usr/lib/qt6/bin/qmake \
    /usr/bin/qmake6 \
    /usr/local/bin/qmake6; do
    if [[ -x "$candidate" ]]; then
        # Verify it really is Qt6
        if "$candidate" -query QT_VERSION 2>/dev/null | grep -q "^6\."; then
            QMAKE6="$candidate"
            break
        fi
    fi
done

# Last resort: find any qmake binary that reports Qt6
if [[ -z "$QMAKE6" ]]; then
    while IFS= read -r qm; do
        if "$qm" -query QT_VERSION 2>/dev/null | grep -q "^6\."; then
            QMAKE6="$qm"; break
        fi
    done < <(find /usr -name "qmake*" -executable 2>/dev/null | sort)
fi

[[ -n "$QMAKE6" ]] || die "Could not find qmake6. Install qt6-base or qt6-tools."
info "Using qmake6: $QMAKE6 ($(${QMAKE6} -query QT_VERSION))"
export QMAKE="$QMAKE6"

# Derive Qt prefix from qmake
QT_PREFIX="$("$QMAKE6" -query QT_INSTALL_PREFIX)"
info "Qt prefix: $QT_PREFIX"

# ── Build ─────────────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == false ]]; then
    info "Configuring Release build..."
    cmake -S "$SCRIPT_DIR" -B "$BUILD_DIR" \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr
    info "Building..."
    cmake --build "$BUILD_DIR" --parallel "$(nproc)"
else
    [[ -d "$BUILD_DIR" ]] || die "Build directory $BUILD_DIR does not exist."
    info "Skipping build."
fi

# ── Install into AppDir ───────────────────────────────────────────────────────
info "Installing into AppDir..."
rm -rf "$APPDIR"
DESTDIR="$APPDIR" cmake --install "$BUILD_DIR"

# ── Desktop file and icon ─────────────────────────────────────────────────────
info "Copying desktop file and icon..."
[[ -f "$SCRIPT_DIR/fitsmetadataviewer.desktop" ]] || die "Missing fitsmetadataviewer.desktop"
[[ -f "$SCRIPT_DIR/fitsmetadataviewer.svg"     ]] || die "Missing fitsmetadataviewer.svg"

install -Dm644 "$SCRIPT_DIR/fitsmetadataviewer.desktop" \
    "$APPDIR/usr/share/applications/fitsmetadataviewer.desktop"
install -Dm644 "$SCRIPT_DIR/fitsmetadataviewer.svg" \
    "$APPDIR/usr/share/icons/hicolor/scalable/apps/fitsmetadataviewer.svg"

# FIX 2: appimagetool requires the .desktop file AND icon at the AppDir root
cp "$SCRIPT_DIR/fitsmetadataviewer.desktop" "$APPDIR/fitsmetadataviewer.desktop"

# AppStream metadata — suppresses appimagetool warning
install -Dm644 "$SCRIPT_DIR/appstream/fitsmetadataviewer.appdata.xml" \
    "$APPDIR/usr/share/metainfo/fitsmetadataviewer.appdata.xml" 
cp "$SCRIPT_DIR/fitsmetadataviewer.svg"     "$APPDIR/fitsmetadataviewer.svg"

# ── Pass 1: Deploy ELF dependencies ──────────────────────────────────────────
info "Pass 1: deploying ELF dependencies..."
export DISABLE_COPYRIGHT_FILES_DEPLOYMENT=1
"$LINUXDEPLOY" \
    --appdir="$APPDIR" \
    --executable="$APPDIR/usr/bin/$BINARY_NAME" \
    --desktop-file="$APPDIR/usr/share/applications/fitsmetadataviewer.desktop" \
    --icon-file="$SCRIPT_DIR/fitsmetadataviewer.svg" \
    || true  # strip errors on modern Arch ELFs are non-fatal

# ── Pass 2: Bundle Qt plugins and QML imports ─────────────────────────────────
info "Pass 2: bundling Qt plugins and QML imports..."
export QML_SOURCES_PATHS="$SCRIPT_DIR/qml"

"$LINUXDEPLOY_QT" --appdir="$APPDIR" || true

# ── Write AppRun ──────────────────────────────────────────────────────────────
info "Writing AppRun..."
cat > "$APPDIR/AppRun" << 'APPRUN'
#!/usr/bin/env bash
HERE="$(cd "$(dirname "$0")" && pwd)"
export LD_LIBRARY_PATH="$HERE/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export QT_PLUGIN_PATH="$HERE/usr/plugins${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"
export QML_IMPORT_PATH="$HERE/usr/qml${QML_IMPORT_PATH:+:$QML_IMPORT_PATH}"
export QT_QPA_PLATFORM_PLUGIN_PATH="$HERE/usr/plugins/platforms"
exec "$HERE/usr/bin/AstroDataViewer" "$@"
APPRUN
chmod +x "$APPDIR/AppRun"

# ── Produce AppImage ──────────────────────────────────────────────────────────
info "Producing AppImage..."
export ARCH="$ARCH"
OUTPUT="$SCRIPT_DIR/FITSMetadataViewer-${ARCH}.AppImage"
rm -f "$OUTPUT"

# Prefer system appimagetool (understands modern .relr.dyn ELF sections);
# fall back to the downloaded one
if command -v appimagetool &>/dev/null && \
   appimagetool --version 2>&1 | grep -qv "^/tmp/"; then
    appimagetool "$APPDIR" "$OUTPUT"
else
    # The downloaded appimagetool needs FUSE or --appimage-extract-and-run
    APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGETOOL" "$APPDIR" "$OUTPUT"
fi

echo ""
if [[ -f "$OUTPUT" ]]; then
    success "AppImage created: $OUTPUT"
    ls -lh "$OUTPUT"
else
    die "AppImage was not created. Check output above for errors."
fi
