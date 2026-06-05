# FITS Metadata Viewer (Qt/QML Rewrite)

A desktop application for scanning and inspecting FITS file metadata using Qt 6 and QML.

## Project Structure

- `CMakeLists.txt` - Qt CMake project file
- `src/` - C++ backend and data models
- `qml/` - QML user interface components
- `resources/` - application assets

## Features

- Recursive FITS file scanning
- FITS header metadata extraction without Python
- Target grouping and integration-time aggregation
- Calibration frame summaries for darks, flats, and bias frames
- QML-based UI with KDE-friendly theming support

## Build Instructions

### Prerequisites

- Qt 6 (including `Qt6::Core`, `Qt6::Quick`, `Qt6::QuickControls2`, `Qt6::Qml`, `Qt6::Network`, `Qt6::Concurrent`)
- CMake 3.16 or newer
- Ninja (recommended) or another build backend
- A C++17 toolchain

### Build

```bash
bash rebuild.sh
```

### Run

```bash
cd /FITS-Metadata-Viewer/build
./AstroDataViewer
```

## Notes

- The current executable name is `AstroDataViewer` after the Qt/CMake build.
- The UI is designed to work well on KDE/CachyOS and uses theme-aware styling for better desktop integration.
- Generated QML files live under `build/qml/`; source QML is in `qml/`.

