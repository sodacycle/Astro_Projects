# FITS Metadata Viewer

A desktop application for scanning and inspecting FITS file metadata, built with Qt 6 and QML.

---

## Features

- Recursive directory scanning for `.fit` / `.fits` files
- FITS header metadata extraction — no Python or external tools required
- Target grouping with total integration time aggregation
- Calibration frame summaries (darks, flats, bias) grouped by settings
- Imaging calendar with moon phase and historical weather data
- Catalog breakdown by Messier, NGC, IC, Sharpless, Barnard, and more
- File organiser tools — sort stacked files, remove JPGs, prepare for Siril
- Native system theme — automatically matches your KDE/GTK desktop

---

## Project Structure

```
FITS-Metadata-Viewer/
├── src/                   C++ backend — parsers, scanners, models, services
├── qml/                   QML user interface components
│   └── components/        Reusable QML sub-components
├── resources/             Application assets
├── appstream/             AppStream metadata (for software centres)
├── CMakeLists.txt         CMake build definition
├── rebuild.sh             Quick dev build script
├── build-appimage.sh      Portable AppImage packaging script
├── fitsmetadataviewer.desktop   Desktop entry file
├── fitsmetadataviewer.svg       Application icon
└── fitsmetadataviewer.appdata.xml  AppStream metadata
```

---

## Building the Application

There are two ways to build FITS Metadata Viewer depending on your goal.

---

### Option 1 — `build.sh` (Development Build)

**Use this when:** you are developing, testing, or just want to run the app
on your own machine where Qt 6 is already installed.

This script does a clean CMake configure and build directly on your system.
The resulting binary links against your installed Qt 6 libraries and must be
run from a machine that has Qt 6 installed. It is the fastest way to get a
working binary and is the right choice for day-to-day development.

#### Prerequisites

| Dependency | Arch / Manjaro | Fedora | Ubuntu 24.04 |
|---|---|---|---|
| Qt 6 base | `qt6-base` | `qt6-qtbase-devel` | `qt6-base-dev` |
| Qt 6 Declarative | `qt6-declarative` | `qt6-qtdeclarative-devel` | `qml6-module-qtquick` |
| Qt 6 Tools | `qt6-tools` | `qt6-qttools-devel` | `qt6-tools-dev` |
| CMake ≥ 3.16 | `cmake` | `cmake` | `cmake` |
| C++17 compiler | `gcc` / `clang` | `gcc-c++` | `g++` |

On Arch / Manjaro:
```bash
sudo pacman -S qt6-base qt6-declarative qt6-tools cmake gcc
```

#### Build and Run

```bash
# From the project root
bash build.sh

# Then run
./build/AstroDataViewer
```

The script automatically:
1. Touches all source files to prevent ninja clock-skew errors
2. Removes the stale `build/` directory
3. Configures a fresh Release build
4. Compiles with all available CPU cores

---

### Option 2 — `build-appimage.sh` (Portable AppImage)

**Use this when:** you want to distribute the application to other Linux
machines that may not have Qt 6 installed, or you want a single self-contained
executable file you can copy anywhere and run directly.

An AppImage bundles the application binary together with all required Qt 6
libraries, platform plugins, and QML modules into a single `.AppImage` file.
The recipient only needs to mark it executable and run it — no installation,
no package manager, no Qt required on their system.

This option takes longer than a dev build and produces a larger file (~43 MB)
because it copies all dependencies into the package. It is the right choice
for sharing releases or running the app on a distro where Qt 6 is not
available or is a different version.

#### Prerequisites

Only a C++17 compiler, CMake, and Qt 6 dev packages are needed (same as
Option 1). The script downloads `linuxdeploy`, `linuxdeploy-plugin-qt`, and
`appimagetool` automatically into a `tools/` directory on first run. Subsequent
runs use the cached copies.

An internet connection is required on the first run only.

#### Build

```bash
# Full build (compile + package)
bash build-appimage.sh

# If you have already compiled with build.sh or a previous AppImage run,
# skip the compile step and go straight to packaging:
bash build-appimage.sh --skip-build
```

The script:
1. Downloads AppImage tooling if not already cached
2. Compiles the project in Release mode into `build-release/`
3. Installs the binary into a staging `AppDir/`
4. Bundles all Qt 6 shared libraries and platform plugins
5. Produces `FITSMetadataViewer-x86_64.AppImage` in the project root

#### Running the AppImage

```bash
chmod +x FITSMetadataViewer-x86_64.AppImage
./FITSMetadataViewer-x86_64.AppImage
```

Or double-click it in your file manager.

---

## Quick Comparison

| | `build.sh` | `build-appimage.sh` |
|---|---|---|
| **Purpose** | Development / personal use | Distribution / portability |
| **Output** | `build/AstroDataViewer` binary | `FITSMetadataViewer-x86_64.AppImage` |
| **Requires Qt 6 on target** | Yes | No — bundled inside |
| **Build time** | Fast (~1 min) | Slower (~3–5 min first run) |
| **Output size** | Small (~5 MB binary) | ~43 MB self-contained |
| **Internet needed** | No | First run only (tool download) |
| **System theme support** | Full (uses installed Qt) | Partial (bundled Qt style) |

---

## Notes

- The application uses `QFileDialog` for directory selection, which requires
  Qt 6 Widgets. This provides a native KDE/GTK file picker on supported
  desktops.
- Weather data is fetched from the Open-Meteo API using observation coordinates
  extracted from your FITS headers. No API key is required.
- Settings (temperature unit preference, last-used location) are stored via
  `QSettings` in the standard platform location
  (`~/.config/FITSMetadataViewer/`).
- This project was rewritten from an Electron-based FITS metadata viewer into
  a native Qt/QML desktop application.
