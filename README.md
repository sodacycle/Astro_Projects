# FITS Metadata Viewer

A cross-platform desktop application for scanning and analyzing FITS (Flexible Image Transport System) astronomy files. Built with Electron, this GUI tool extracts metadata from FITS headers and provides aggregated statistics by astronomical target, all without requiring Python or external FITS libraries.

## Features

### Core Functionality
- **Recursive Directory Scanning**: Searches through selected directory and all subdirectories for FITS files
- **Smart File Filtering**: Automatically excludes calibration files (those starting with  Stacked_)
- **Custom FITS Parser**: Built-in header parser supporting both .fit and .fits extensions
- **Target Extraction**: Intelligently extracts target names from filenames or FITS headers
- **Metadata Aggregation**: Groups files by astronomical target and calculates total integration time

### Extracted Metadata Fields
- **Observation Details**: Start/End times, exposure time, number of subs, total exposure
- **Telescope & Camera**: Model information with fallback logic for various FITS formats
- **Imaging Parameters**: Binning, filter used, gain, focal length, aperture, focus position
- **Location Data**: Latitude, longitude, sensor temperature
- **File Information**: Image type, stacking software, raw header JSON

#### Siril Preparation
- Recursively scans the selected directory and all subdirectories
- Detects every file whose name begins with `Light`
- Creates a `lights/` subdirectory inside each folder where Light files are found
- Moves each Light file into its corresponding `lights` folder
- Ideal for preparing directory structures for Siril preprocessing
- Displays real-time progress using the global progress bar
- Fully cancelable using the Stop button


### User Interface
- **Progress Tracking**: Real-time progress bar with file count updates
- **Cancelable Scans**: Stop button to abort long-running scans
- **Dual Table Display**:
  - **Summary Table**: Target-level aggregation (file count, summed exposure time)
  - **Details Table**: Individual file metadata
- **Responsive Design**: Clean, readable tables with proper column headers
- **Siril Prep Workflow**: A dedicated button that automatically organizes Light frames into Siril‑compatible `lights/` subdirectories with progress tracking
- **Remove Empty Folders**: A dedicated button that will parse subfolders and remove empty folder left behind once 'Organize Stacked Files' has been used


### Cross-Platform Support
- **Windows**: Native .exe execution
- **macOS**: Native .app bundle
- **Linux**: Native binary for various distributions

## Requirements

- **Node.js**: Version 16.0.0 or higher
- **npm**: Included with Node.js
- **Operating System**: Windows 10+, macOS 10.13+, or Linux (Ubuntu 18.04+, CentOS 7+, etc.)

## Installation & Setup

### Windows

1. **Install Node.js**:
   - Download from [nodejs.org](https://nodejs.org/)
   - Choose the LTS version for Windows
   - Run the installer and follow the setup wizard

2. **Clone/Download the Project**:
   ```bash
   cd C:\Users\YourName\Documents
   git clone <repository-url> Astro_Projects
   cd Astro_Projects
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Run the Application**:
   ```bash
   npm start
   ```

### macOS

1. **Install Node.js**:
   - Download from [nodejs.org](https://nodejs.org/)
   - Choose the LTS version for macOS
   - Open the .pkg file and follow the installation wizard

2. **Clone/Download the Project**:
   ```bash
   cd ~/Documents
   git clone <repository-url> Astro_Projects
   cd Astro_Projects
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Run the Application**:
   ```bash
   npm start
   ```

### Linux (Ubuntu/Debian)

1. **Install Node.js**:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

2. **Clone/Download the Project**:
   ```bash
   cd ~/Documents
   git clone <repository-url> Astro_Projects
   cd Astro_Projects
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Run the Application**:
   ```bash
   npm start
   ```

### Linux (CentOS/RHEL/Fedora)

1. **Install Node.js**:
   ```bash
   curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
   sudo yum install -y nodejs
   ```

2. **Clone/Download the Project**:
   ```bash
   cd ~/Documents
   git clone <repository-url> Astro_Projects
   cd Astro_Projects
   ```

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Run the Application**:
   ```bash
   npm start
   ```

## Usage

### Basic Operation

1. **Launch the Application**:
   ```bash
   npm start
   ```

2. **Select Directory**:
   - Click the Select Directory button
   - Choose a folder containing your FITS files
   - The app will recursively scan all subdirectories

3. **Start Scanning**:
   - Click Scan FITS to begin processing
   - Watch the progress bar for real-time updates
   - Use Stop Scan to cancel if needed

4. **View Results**:
   - **Summary Table**: Shows aggregated data per astronomical target
   - **Details Table**: Shows individual file metadata

5. **Organize Stacked Files**:
    - Click 'Organize Stacked Files'
        - The app will:
            - Find all `Stacked_*.fit` & `DSO_Stacked_*.fit` files
         - Extract target names
            - Create a `Stacked_/<Target Name>/` folder structure
            - Move each stacked file into its matching target folder -- **overwriting any files with the same name within that folder**

6. **Remove JPG Files**:
    - Click `Remove .jpg FIles`
    - The app will:
        - Recursively find all .jpg and .jpeg files
        - Delete them while showing progress
        - Allow cancellation via the Stop button

7. **Siril Prep**:
    - Click `Siril Prep`
    - The app will:
        - Recursively scan the selected directory and all subdirectories
        - Find every file whose name begins with `Light`
        - Create a new subdirectory named `lights` inside each folder where Light files are found
        - Move each Light file into its corresponding `lights` subdirectory -- **overwriting any files with the same name within that folder**
        - Display real-time progress updates using the same progress bar used for JPG removal
        - Allow cancellation at any time using the Stop button

8. **Remove Empty Folders**:
   - Click 'Remove Empty Folders'
   - The app will:
      - Scan for any empty folders left behind after 'Organize Stacked Files' has been used
      - Delete the empty folders

### Understanding the Output

#### Summary Table Columns
- **Target**: Astronomical object name (extracted from filename or header)
- **FITS Count**: Total number of FITS files for this target
- **Files With Exposure**: Number of files with valid exposure time data
- **Total Integration Time**: Total exposure time across all files in HH:MM:SS Format

#### Details Table Columns
- **File**: Filename
- **Target**: Astronomical target
- **Start Time UTC / End Time UTC**: Observation start and calculated end times
- **Exposure Time s**: Individual frame exposure time
- **Number of Subs**: Number of sub-exposures stacked
- **Total Exposure Time s**: Calculated total exposure (exposure � subs)
- **Telescope**: Telescope model (falls back to camera if not available)
- **Camera Model**: Camera model
- **Sensor Temperature C**: Camera sensor temperature
- **RA / DEC**: Right Ascension and Declination coordinates
- **Latitude / Longitude**: Observation location
- **Binning**: Pixel binning (e.g., 1x1, 2x2)
- **Filter Used**: Optical filter
- **Gain**: Camera gain setting
- **Focal Length mm**: Telescope focal length
- **Aperture mm**: Telescope aperture
- **Focus Position**: Focus motor position
- **Image Type**: Type of image (Light, Dark, Flat, etc.)
- **Stacking Software**: Software used for stacking

## Technical Details

### FITS Parsing
- **Format Support**: Standard FITS format with 80-byte header cards
- **Header Reading**: 2880-byte block reading until END keyword
- **Value Types**: Automatic detection of strings, numbers, and booleans
- **Comment Stripping**: Removes inline comments after / character

### Target Name Extraction
1. **Primary Method**: Filename pattern matching (e.g., `Light_M31_10.0s_Ha_20240101-120000.fit` to  `M31`)
2. **Fallback**: FITS header OBJECT field
3. **Final Fallback**: Unknown

### Telescope/Camera Detection
- **Priority Order**: `TELESCOP` | `TELESCOPE` | `CREATOR` | `INSTRUME` | `CAMERA` | `CAM`
- **Fallback Logic**: If telescope is `unknown`, uses `camera model` instead

### Date/Time Handling
- **Parsing**: ISO 8601 format with dayjs library
- **Timezone**: UTC handling
- **Arithmetic**: End time calculated as start + total exposure

### File Filtering
- **Included**: `.fit` and `.fits` files (case-insensitive)
- **Excluded**: Files starting with `Stacked_` (calibration stacks)
- **JPG Removal**: `.jpg`, `.jpeg` (case-insensitive)
- **Siril Prep**: Files starting with `Lights` (siril stacking prep)

## Troubleshooting

### Common Issues

**Application Won't Start**
- Ensure Node.js 16+ is installed: 
`node --version`
- Clear node_modules and reinstall: 
`m -rf node_modules && npm install`
- Check for port conflicts (default Electron port)

**No FITS Files Found**
- Verify files have .fit or .fits extensions
- Check file permissions
- Ensure directory path is accessible

**Metadata Shows Unknown**
- FITS files may use non-standard header fields
- Seestar S30 uses CREATOR field for camera model
- Target names extracted from filenames when `OBJECT` field missing

**Scan Takes Too Long**
- Large directories with many files may take time
- Use Stop Scan to cancel and try smaller directory
- Progress updates every 10 files for responsiveness

**Permission Errors**
- Windows: Run as Administrator or check folder permissions
- macOS: Grant disk access in `System Preferences > Security & Privacy`
- Linux: Check file ownership and permissions

**Siril Prep Didn’t Move Any Files**
- Ensure your Light frames begin with the exact prefix `Light`
- Check that the selected directory contains subfolders with Light files
- Verify file permissions allow moving files

### Performance Notes
- **Memory Usage**: Scales with number of FITS files
- **Large Libraries**: 1000+ files may take several minutes
- **UI Responsiveness**: Progress updates prevent UI freezing

## Development

### Project Structure
```text
Astro_Projects/
+-- main.js              # Electron main process
+-- preload.js           # Context bridge for IPC
+-- renderer.js          # UI event handling
+-- fits-parser.js       # Custom FITS header parser
+-- index.html           # Application UI
+-- package.json         # Dependencies and scripts
+-- README.md            # This file
```

### Building for Distribution

**Windows Executable**:
```bash
npm run pack
npm run dist
```

**macOS Application**:
```bash
npm run pack
npm run dist
```

**Linux Binary**:
```bash
npm run pack
npm run dist
```

### Dependencies
- **Electron**: Cross-platform desktop framework
- **dayjs**: Date/time parsing and formatting
- **Node.js built-ins**: fs, path for file system operations

## License



## Contributing



## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify your FITS files are standard format
3. Test with a small directory first
4. Include error messages and your operating system when reporting issues
