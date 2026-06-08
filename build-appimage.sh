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
warn()    { echo -e "\e[1;33mWARN: $*\e[0m"; }
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
    info "Fixing file timestamps to prevent clock-skew warnings..."
    find "$SCRIPT_DIR/src" "$SCRIPT_DIR/qml" "$SCRIPT_DIR/CMakeLists.txt" \
         -type f \( -name "*.cpp" -o -name "*.h" -o -name "*.qml" -o -name "CMakeLists.txt" \) \
         -exec touch {} + 2>/dev/null || true

    info "Configuring Release build..."
    cmake -S "$SCRIPT_DIR" -B "$BUILD_DIR" \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr
    info "Building..."
    cmake --build "$BUILD_DIR" --parallel "$(nproc)"
else
    [[ -d "$BUILD_DIR" ]] || die "Build directory $BUILD_DIR does not exist."
    info "Skipping build."
    # Touch source files to prevent ninja clock-skew warnings on the install step
    find "$SCRIPT_DIR/src" "$SCRIPT_DIR/qml" "$SCRIPT_DIR/CMakeLists.txt" \
         -type f \( -name "*.cpp" -o -name "*.h" -o -name "*.qml" -o -name "CMakeLists.txt" \) \
         -exec touch {} + 2>/dev/null || true
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

# AppStream metadata — filename must match the component ID to pass appstreamcli validation.
APPDATA="$SCRIPT_DIR/appstream/app.fitsmetadataviewer.FITSMetadataViewer.metainfo.xml"
if [[ -f "$APPDATA" ]]; then
    install -Dm644 "$APPDATA" "$APPDIR/usr/share/metainfo/app.fitsmetadataviewer.FITSMetadataViewer.metainfo.xml"
else
    warn "appstream/app.fitsmetadataviewer.FITSMetadataViewer.metainfo.xml not found — AppStream metadata will be missing."
fi
cp "$SCRIPT_DIR/fitsmetadataviewer.svg"     "$APPDIR/fitsmetadataviewer.svg"

# ── Pass 1: Deploy ELF dependencies ──────────────────────────────────────────
info "Pass 1: deploying ELF dependencies..."
export DISABLE_COPYRIGHT_FILES_DEPLOYMENT=1
# Redirect stderr to filter out the known strip/.relr.dyn noise from linuxdeploy's
# bundled old strip binary. The "Failed to execute deferred operations" line and all
# "Strip call failed" / "unknown type [0x13]" messages are harmless — libraries are
# copied correctly before strip is attempted. We show everything except those lines.
"$LINUXDEPLOY" \
    --appdir="$APPDIR" \
    --executable="$APPDIR/usr/bin/$BINARY_NAME" \
    --desktop-file="$APPDIR/usr/share/applications/fitsmetadataviewer.desktop" \
    --icon-file="$SCRIPT_DIR/fitsmetadataviewer.svg" \
    2>&1 | grep -v "Strip call failed\|relr\.dyn\|Unable to recognise\|deferred operations\|unsupported GNU_PROPERTY" || true

# ── Pass 2: Bundle Qt plugins and QML imports ─────────────────────────────────
info "Pass 2: bundling Qt plugins and QML imports..."
export QML_SOURCES_PATHS="$SCRIPT_DIR/qml"

# Exclude Qt modules this app does not use to keep the AppImage small.
# VirtualKeyboard, PDF, Timeline, VectorImage, and the KDE extra image
# format plugins (kimg_*) are pulled in transitively by the Qt plugin
# scanner but are not needed for a FITS metadata viewer.
export EXCLUDE_LIBS="libQt6VirtualKeyboard.so.6:libQt6VirtualKeyboardQml.so.6:libQt6VirtualKeyboardSettings.so.6:libQt6Pdf.so.6:libQt6PdfQuick.so.6:libQt6QuickTimeline.so.6:libQt6QuickTimelineBlendTrees.so.6:libQt6QuickVectorImage.so.6:libQt6QuickVectorImageGenerator.so.6:libQt6QuickVectorImageHelpers.so.6:libQt6PrintSupport.so.6:libQt6Sql.so.6:libQt6Svg.so.6:libQt6HunspellInputMethod.so.6:libQt6QmlXmlListModel.so.6:libQt6QmlLocalStorage.so.6"

"$LINUXDEPLOY_QT" --appdir="$APPDIR" \
    2>&1 | grep -v "Strip call failed\|relr\.dyn\|Unable to recognise\|deferred operations\|unsupported GNU_PROPERTY" || true

# Remove unused QML modules that were bundled anyway
info "Removing unused QML modules..."
rm -rf     "$APPDIR/usr/qml/QtQuick/VirtualKeyboard"     "$APPDIR/usr/qml/QtQuick/Pdf"     "$APPDIR/usr/qml/QtQuick/Timeline"     "$APPDIR/usr/qml/QtQuick/VectorImage"     "$APPDIR/usr/qml/QtQuick/tooling"     "$APPDIR/usr/qml/QtQuick/LocalStorage"     "$APPDIR/usr/qml/QtQuick/Particles"     "$APPDIR/usr/qml/QtQuick/Shapes/DesignHelpers"     "$APPDIR/usr/qml/QtQuick/Controls/designer"     2>/dev/null || true

# Remove KDE extra image format plugins — not needed for FITS metadata display
info "Removing unused image format plugins..."
find "$APPDIR/usr/plugins/imageformats" -name "kimg_*" -delete 2>/dev/null || true

# Remove unused lib dependencies pulled in by excluded modules
info "Removing unused libraries..."
for lib in     libQt6VirtualKeyboard libQt6Pdf libQt6PdfQuick libQt6PrintSupport     libQt6Sql libQt6Svg libQt6HunspellInputMethod libQt6QmlXmlListModel     libQt6QmlLocalStorage libQt6QuickTimeline libQt6QuickTimelineBlendTrees     libQt6QuickVectorImage libQt6QuickVectorImageGenerator libQt6QuickVectorImageHelpers     libhunspell libOpenEXR libIex libIlmThread libOpenEXRCore     libraw libheif libde265 libaom libdav1d libSvtAv1Enc librav1e     libavif libjxl libjxl_cms libjxl_threads libhwy libsharpyuv     libwebp libwebpdemux libwebpmux libopenjp2 libopenjph libjpegxr libjxrglue     libjasper libtiff liblcms2 libyuv libmng libx264 libx265 libopenh264     libdeflate libjbig libjpeg; do
    find "$APPDIR/usr/lib" -name "${lib}.so*" -delete 2>/dev/null || true
done

# ── Write AppRun ──────────────────────────────────────────────────────────────
info "Writing AppRun..."
cat > "$APPDIR/AppRun" << 'APPRUN'
#!/usr/bin/env bash
HERE="$(cd "$(dirname "$0")" && pwd)"

# Core library and plugin paths
export LD_LIBRARY_PATH="$HERE/usr/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export QT_PLUGIN_PATH="$HERE/usr/plugins${QT_PLUGIN_PATH:+:$QT_PLUGIN_PATH}"
export QML_IMPORT_PATH="$HERE/usr/qml${QML_IMPORT_PATH:+:$QML_IMPORT_PATH}"
export QT_QPA_PLATFORM_PLUGIN_PATH="$HERE/usr/plugins/platforms"

# Platform theme — detect the running desktop and apply the matching Qt
# platform theme plugin if it was bundled. This gives a native file picker
# and colour scheme on GNOME (gtk3) and KDE (kde/kde6) desktops.
# If neither plugin is available the app falls back to Qt's Fusion style.
if [ -z "$QT_QPA_PLATFORMTHEME" ]; then
    _DESKTOP="${XDG_CURRENT_DESKTOP:-}${DESKTOP_SESSION:-}"
    _DESKTOP_LOWER="$(echo "$_DESKTOP" | tr '[:upper:]' '[:lower:]')"
    case "$_DESKTOP_LOWER" in
        *gnome*|*unity*|*cinnamon*|*mate*|*xfce*)
            [ -f "$HERE/usr/plugins/platformthemes/libqgtk3.so" ] && \
                export QT_QPA_PLATFORMTHEME=gtk3
            ;;
        *kde*|*plasma*)
            if [ -f "$HERE/usr/plugins/platformthemes/libqkde6.so" ]; then
                export QT_QPA_PLATFORMTHEME=kde6
            elif [ -f "$HERE/usr/plugins/platformthemes/libqkde.so" ]; then
                export QT_QPA_PLATFORMTHEME=kde
            fi
            ;;
    esac
fi

# Wayland — if the session is Wayland and the bundled platform plugin exists,
# prefer native Wayland rendering. Falls back silently to XWayland (xcb)
# which works on all compositors.
if [ -z "$QT_QPA_PLATFORM" ] && [ -n "$WAYLAND_DISPLAY" ]; then
    [ -f "$HERE/usr/plugins/platforms/libqwayland-generic.so" ] && \
        export QT_QPA_PLATFORM=wayland
fi

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
