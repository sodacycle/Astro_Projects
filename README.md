# FITS Metadata Viewer

A desktop application for scanning and inspecting FITS file metadata, built with Qt 6 and QML.

# Download Options:

**Linux:** [AppImage](https://github.com/sodacycle/FITS-Metadata-Viewer/releases/download/1.0_beta/AstroDataViewer)

**SHA-256:** `f26ab61e93795700edca011fbb810a005f4bfd5a9c3ca133ded289fadb153f2f`

**Download Information:** [Version 1.0 Beta](https://github.com/sodacycle/FITS-Metadata-Viewer/releases/tag/1.0_beta)
---

## Features

- Recursive directory scanning for `.fit` / `.fits` files
- FITS header metadata extraction — no Python or external tools required
- **FITS image viewer** — display and inspect individual FITS images with zoom and pan controls
- Target grouping with total integration time aggregation
- Calibration frame summaries (darks, flats, bias) grouped by settings
- Imaging calendar with moon phase and historical weather data
- Catalog breakdown by Messier, NGC, IC, Sharpless, Barnard, and more
- Interactive metadata table with extensive columns (telescope, camera, sensor temp, RA/DEC, focal length, gain, etc.)
- Smart filtering by target name, catalog, and observation date
- File organiser tools:
  - Sort and organize stacked files into dedicated folders
  - Scan for JPG files and optionally delete them
  - Prepare directory structure for Siril preprocessing
  - Remove empty folders
- Weather integration — fetches historical weather data based on observation coordinates
- Native system theme — automatically matches your KDE/GTK desktop
- Cross-platform support (Linux AppImage and Windows)

---

## Features in Detail

### FITS Image Viewer

Click on any file in the metadata table to open it in a dedicated dark-themed viewer window. Features include:

**Navigation & Zoom:**
- **Zoom controls** — zoom in/out (−/+), fit-to-window, and 1:1 pixel-perfect viewing
- **Keyboard shortcuts** — arrow keys (← / →) to navigate between images in the current scan
- **Pan and scroll** — use mouse to drag and navigate large images with centered panning
- **File counter** — displays current image position (e.g., 15 / 247)

**Image Processing & Display:**
- **Asinh stretch** — adjustable stretch parameter ('a') to reveal faint details with control over aggressiveness
- **Clipping control** — percentile-based clip level (90–99.9%) to manage bright outlier handling
- **Denoising** — optional box blur (radius 0–5) to smooth noise without degrading star detail
- **Live preview** — all adjustments apply in real-time; parameters persist across image navigation
- **Reset button** — restore defaults (a=0.10, clip=99.0%, denoise=off) with one click

**Image Quality Workflow:**
- **Reject/Unreject** — mark individual images as rejected with a visual red X overlay
- **Finalize rejected images** — batch-move all rejected images to a dedicated folder without modifying the original FITS data
- **Live rejection counter** — displays how many images are marked for rejection

**File Management & Safety:**
- **Safe file handling** — gracefully handles compressed FITS, missing pixel data, and large files (512 MB safety limit)
- **File deletion** — permanently delete the viewed file directly from the viewer window with confirmation
- **Full file path display** — shows complete path with tooltip hover

### Metadata and Filtering

The comprehensive metadata table displays detailed information for each FITS file:

- **Observation data**: Target name, integration time, number of subs, date/time
- **Telescope & Camera**: Telescope, camera model, sensor temperature
- **Coordinates**: RA, DEC, observation latitude/longitude
- **Camera settings**: Binning, gain, focal length, aperture, focus position
- **Image properties**: Filter, image type, frame type (light/dark/flat/bias)
- **Processing**: Stacking software used

**Interactive filtering and navigation:**
- **Metadata table** — click any file row to open it in the FITS viewer
- **Target filter** — select a target to see all exposures of that object
- **Catalog filter** — filter by catalog (Messier, NGC, IC, Sharpless, Barnard, etc.) to explore specific regions
- **Calendar** — click observation dates to view all images from that night; includes moon phase and weather data
- **Temperature unit toggle** — click the °C / °F button in the calendar header to switch between Celsius and Fahrenheit
- **Show All button** — appears after filtering to quickly restore the full list
- **JPG integration** — scan for and view JPG preview files alongside FITS metadata

### Target Summary

A quick overview of all observation targets with aggregated statistics:

- **Target names** — clickable rows to filter the metadata table to that target
- **FITS file count** — total number of exposures for each target
- **Total integration time** — combined exposure duration per target (useful for planning follow-up observations)

### Calibration Frame Summary

Automatically categorizes and groups calibration frames by type and settings:

- **Grouped by type** — separate sections for dark frames, flat fields, and bias frames
- **Settings-based grouping** — frames are grouped by temperature, binning, and other key parameters to help identify compatible calibration sets
- **Frame counts** — displays total count of each calibration type for reference
- **Easy identification** — quickly locate calibration frames matching your light frame parameters

### Catalog Breakdown

Organizes observations by astronomical catalog to explore your imaging data by region:

- **Multiple catalogs supported** — Messier, NGC, IC, Caldwell, Sharpless, Barnard, LDN, LBN, Abell, PGC, UGC, and Other
- **Smart parsing** — automatically detects catalog designations from target names in FITS headers
- **Clickable filters** — select any catalog to filter the metadata table to those observations
- **Ungrouped objects** — "Other" category captures objects not in standard catalogs

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
├── build.sh             Quick dev build script
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

---

### Option 3 — `build-windows.ps1` (Windows Build)

**Use this when:** you are building on or for Windows 10/11.

The application compiles and runs on Windows without code changes. Qt 6 handles
all platform differences: `QFileDialog` uses the native Windows file picker,
the window uses the native Windows title bar and style, and `QNetworkAccessManager`
uses Windows networking APIs.

#### Prerequisites

| Requirement | Where to get it |
|---|---|
| Qt 6.6+ | [Qt Online Installer](https://www.qt.io/download) — choose MSVC 2019/2022 64-bit or MinGW 64-bit |
| Visual Studio 2019/2022 | [visualstudio.microsoft.com](https://visualstudio.microsoft.com/) — install "Desktop development with C++" workload |
| CMake 3.16+ | Bundled with Visual Studio, or [cmake.org](https://cmake.org/download/) |

> **MinGW alternative:** If you prefer to avoid Visual Studio, install the
> MinGW 64-bit toolchain via the Qt Installer. The script auto-detects both.

#### Build

Open **PowerShell** in the project root:

```powershell
# Allow script execution (one-time, run as administrator if needed)
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

# Build and deploy — auto-detects Qt location
.\build-windows.ps1

# If Qt is in a non-standard location:
.\build-windows.ps1 -QtPath "C:\Qt\6.7.0\msvc2019_64"

# Skip recompiling, just re-run the deployment step:
.\build-windows.ps1 -SkipBuild
```

The script configures and compiles in Release mode, then runs `windeployqt6`
to copy all required Qt DLLs, platform plugins, and QML modules into
`dist\FITSMetadataViewer\`. Zip that folder and it runs on any Windows 10/11
machine without Qt installed.

#### Running

Double-click `dist\FITSMetadataViewer\bin\AstroDataViewer.exe` or run it
from a Command Prompt or PowerShell.

---

## Quick Comparison

| | `build.sh` (Linux) | `build-appimage.sh` (Linux) | `build-windows.ps1` (Windows) |
|---|---|---|---|
| **Purpose** | Dev / personal use | Portable Linux bundle | Windows build |
| **Output** | `build/AstroDataViewer` | `*.AppImage` (~43 MB) | `dist/` folder |
| **Requires Qt on target** | Yes | No | No |
| **Build time** | Fast (~1 min) | Slower (~3–5 min first run) | Medium (~2–3 min) |
| **Output size** | ~5 MB binary | ~43 MB | ~60 MB folder |
| **Internet needed** | No | First run only | No |
| **System theme** | Full native | Partial (bundled Qt) | Full native (Windows) |

---

## Desktop Environment Compatibility

The application runs on any Linux desktop. The level of visual integration
depends on which Qt platform theme plugin is installed.

| Desktop | Package to install | What it provides |
|---|---|---|
| KDE Plasma | *(built-in)* | Full Breeze theming, native file picker |
| GNOME | `qt6-platformtheme-gtk3` (Arch) / `qt6-gtk-platformtheme` (Ubuntu) | GTK colour scheme, native GNOME file picker |
| XFCE / Cinnamon / MATE | same as GNOME above | GTK colour scheme, native file picker |
| Other / none | *(nothing required)* | Qt Fusion style — functional but not themed |

The application detects the running desktop at startup and automatically
applies the correct platform theme if the plugin is available. No manual
configuration is required.

### Wayland

GNOME 45+ defaults to a Wayland session. The application supports Wayland
natively if `qt6-wayland` is installed (Arch: `qt6-wayland`, Ubuntu:
`qt6-wayland`). Without it the app runs under XWayland, which works correctly
but without native Wayland HiDPI scaling and input handling.

The application detects the session type at startup and chooses the best
available backend automatically.

---

## Advanced File Organization Tools

The application includes powerful batch file operations accessible from the **Advanced Tools** panel:

| Tool | Purpose | Details |
|------|---------|---------|
| **Organize Stacked Files** | Automatically detects and moves stacked FITS files into a `Stacked/` subfolder | Identifies files by header keywords or filename prefix patterns |
| **Scan for JPG Files** | Recursively finds all `.jpg` files in the selected directory and displays them in the File Details table | Allows selective management of preview images alongside FITS files |
| **Delete JPG Files** | Permanently remove all found JPG files (with confirmation prompt) | Only appears after JPG scan completes; deletes entire batch at once |
| **Siril Prep** | Renames and organizes FITS files into the folder structure expected by Siril preprocessing | Integrates directly with Siril's workflow; creates light/dark/flat/bias subfolders |
| **Remove Empty Folders** | Cleans up empty directories left after file operations or manual deletions | Recursively removes empty folder hierarchies to tidy the directory tree |

All operations display real-time progress in the console log panel and are non-destructive to the original FITS data (except file deletion operations, which require confirmation).

---

## Notes

- **Extensive metadata extraction** — the application parses 21+ FITS header fields including telescope, camera, focal length, aperture, gain, sensor temperature, and coordinates.
- **Weather integration** — weather data is fetched from the Open-Meteo API using observation coordinates extracted from your FITS headers. No API key is required. Historical weather is displayed with weather code emojis in the imaging calendar.
- **Moon phase calculation** — moon phase information is automatically calculated and displayed for each observation date.
- **Native file picker** — the application uses `QFileDialog` for directory selection, providing native KDE/GTK file pickers on supported desktops.
- **Persistent settings** — temperature unit preference, last-used location, and other settings are stored via `QSettings` in the standard platform location (`~/.config/FITSMetadataViewer/` on Linux).
- **Responsive UI** — all batch operations (scanning, organizing, deleting) run asynchronously with progress feedback and status updates.
- **Helpful tooltips** — hover over buttons and controls to see contextual hints explaining their purpose and usage.
- **Safe deletion** — file deletion operations require explicit confirmation before proceeding.
- **This project** was rewritten from an Electron-based FITS metadata viewer into a native Qt/QML desktop application, improving performance and reducing resource usage.
