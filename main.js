const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { parseFitsHeader } = require('./fits-parser');
const dayjs = require('dayjs');



function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    }
  });
  win.loadFile('index.html');
}

app.on('ready', createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

function walkDirectory(dir, filelist = []) {
  const skipDirs = new Set(['process', 'Stacked', 'stacked']); // sets directories to ignore for scanFITS

  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    const isFits = (/\.fit$|\.fits$/i.test(file));
    const isStacked = file.startsWith('Stacked_') || file.startsWith('DSO_Stacked_');

    if (stats.isDirectory()) {

      // Skip unwanted directories
      if (skipDirs.has(file.toLowerCase())) return;

      walkDirectory(fullPath, filelist);
    } 
    else if (isFits && !isStacked) {
      filelist.push(fullPath);
    }
  });

  return filelist;
}


function anyField(header, keys, fallback = 'Unknown') {
  for (const key of keys) {
    if (header[key] !== undefined && header[key] !== null && header[key] !== '') {
      return header[key];
    }
  }
  return fallback;
}

//Time formatting helper
function formatHMS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const h = hours > 0 ? `${hours}h ` : '';
  const m = minutes > 0 ? `${minutes}m ` : '';
  const s = `${seconds}s`;

  return `${h}${m}${s}`.trim();
}


let cancelAllOperations = false;
// let cancelCurrentScan = false;

ipcMain.handle('cancel-all', () => {
  cancelAllOperations = true;
  return { canceled: true };
});

// Scan Fit Files Metadata
ipcMain.handle('scan-fits', async (event, dirPath) => {
  cancelAllOperations = false;
  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };

  const fitFiles = walkDirectory(dirPath);
  const metadataList = [];
  const totalFiles = fitFiles.length;

  event.sender.send('scan-progress', { current: 0, total: totalFiles, status: 'Starting scan...' });

  for (let i = 0; i < fitFiles.length; i++) {
    if (cancelAllOperations) {
    cancelAllOperations = false; // reset for next run
    return { canceled: true, metadataList, targetSummary: [] };
}

    const filePath = fitFiles[i];

    // Yield control to keep UI responsive
    if (i % 10 === 0) {
      await new Promise(resolve => setImmediate(resolve));
      event.sender.send('scan-progress', {
        current: i,
        total: totalFiles,
        status: `Processing ${i}/${totalFiles} files...`
      });
    }

    try {
      const header = parseFitsHeader(filePath);
      // Extract target from filename first, fall back to OBJECT field
      const filename = path.basename(filePath);
      let finalTarget = 'Unknown';
      // Pattern: Light_TARGETNAME_exposure_filter_date.fit
      const filenameMatch = filename.match(/^Light_(.+?)_\d+\.\d+s_/);
      if (filenameMatch) {
        finalTarget = filenameMatch[1].replace(/_/g, ' ');
      } else {
        // Fall back to OBJECT field if filename pattern doesn't match
        finalTarget = anyField(header, ['OBJECT', 'TARGET', 'TITLE'], 'Unknown');
      }
      const exposureTime = Number(anyField(header, ['EXPTIME', 'EXPOSURE', 'EXPOSURE_TIME'], 0));
      const numSubs = Number(anyField(header, ['STACKCNT', 'NFRAMES', 'NSTACK', 'FRAMES'], 1));
      const totalExposure = Number(anyField(header, ['TOTALEXP'], (numSubs && exposureTime ? numSubs * exposureTime : 0)));

      const startTime = anyField(header, ['DATE-OBS', 'DATEOBS', 'DATE_OBS', 'DATE'], 'Unknown');
      let convertedStart = 'Unknown';
      let convertedEnd = 'Unknown';
      try {
        const dt = dayjs(startTime);
        if (dt.isValid()) {
          convertedStart = dt.format('YYYY-MM-DD HH:mm:ss');
          convertedEnd = dt.add(totalExposure, 'second').format('YYYY-MM-DD HH:mm:ss');
        }
      } catch (err) { }

      const cameraModel = anyField(header, ['CREATOR', 'INSTRUME', 'CAMERA', 'CAM'], 'Unknown');
      const telescope = anyField(header, ['TELESCOP', 'TELESCOPE'], 'Unknown');
      const telescopeDisplay = telescope === 'Unknown' ? cameraModel : telescope;

      metadataList.push({
        File: path.basename(filePath),
        Path: filePath,
        Target: finalTarget,
        'Start Time UTC': convertedStart,
        'End Time UTC': convertedEnd,
        'Exposure Time s': exposureTime,
        'Number of Subs': numSubs,
        'Total Exposure Time s': totalExposure,
        Telescope: telescopeDisplay,
        'Camera Model': cameraModel,
        'Sensor Temperature C': anyField(header, ['CCD-TEMP', 'CCD_TEMP', 'CCD-TEMP'], 'Unknown'),
        RA: anyField(header, ['RA'], 'Unknown'),
        DEC: anyField(header, ['DEC'], 'Unknown'),
        Latitude: anyField(header, ['SITELAT', 'LATITUDE', 'OBS-LAT'], 'Unknown'),
        Longitude: anyField(header, ['SITELONG', 'LONGITUDE', 'OBS-LONG'], 'Unknown'),
        Binning: `${anyField(header, ['XBINNING'], 1)}x${anyField(header, ['YBINNING'], 1)}`,
        'Filter Used': anyField(header, ['FILTER', 'FILTER1'], 'Unknown'),
        Gain: anyField(header, ['GAIN'], 'Unknown'),
        'Focal Length mm': anyField(header, ['FOCALLEN', 'FOCAL_LENGTH'], 'Unknown'),
        'Aperture mm': anyField(header, ['APERTURE'], 'Unknown'),
        'Focus Position': anyField(header, ['FOCUSPOS', 'FOCUS_POSITION'], 'Unknown'),
        'Image Type': anyField(header, ['IMAGETYP', 'IMTYPE'], 'Unknown'),
        'Stacking Software': anyField(header, ['CREATOR', 'SOFTWARE', 'STACKING_SOFTWARE'], 'Unknown')
      });
    } catch (err) {
      console.error('Failed to parse FITS', filePath, err);
    }
  }

  event.sender.send('scan-progress', { current: totalFiles, total: totalFiles, status: 'Aggregating data...' });

  const targets = {};
  metadataList.forEach((entry) => {
    const name = entry.Target || 'Unknown';
    if (!targets[name]) targets[name] = { Target: name, files: 0, totalExposure: 0, availableCount: 0 };
    targets[name].files += 1;
    if (!Number.isNaN(entry['Total Exposure Time s']) && entry['Total Exposure Time s'] > 0) {
      targets[name].totalExposure += entry['Total Exposure Time s'];
      targets[name].availableCount += 1;
    }
  });

  const targetSummary = Object.values(targets).map((v) => ({
    Target: v.Target,
    'FITS Count': v.files,
    'Files With Exposure': v.availableCount,
    'Total Integration Time': formatHMS(v.totalExposure)
  }));

  event.sender.send('scan-progress', { current: totalFiles, total: totalFiles, status: 'Complete!' });

  return { metadataList, targetSummary };
});

// Known stacking software (case-insensitive)
const STACKING_SOFTWARE = [
  'siril',
  'deepskystacker',
  'dss',
  'pixinsight',
  'astropixelprocessor',
  'app',
  'autostakkert',
  'registax',
  'sequator',
  'starry landscape stacker'
];

// Check FITS metadata for stacking software
function metadataIndicatesStacking(header) {
  if (!header) return false;

  const keysToCheck = ['PROGRAM', 'SOFTWARE', 'CREATOR', 'HISTORY', 'COMMENT'];

  for (const key of keysToCheck) {
    const value = header[key];
    if (!value) continue;

    const lower = String(value).toLowerCase();
    if (STACKING_SOFTWARE.some(name => lower.includes(name))) {
      return true;
    }
  }

  return false;
}

// Organize Files
ipcMain.handle('organize-stacked', async (event, dirPath) => {
  cancelAllOperations = false;

  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };


  try {
    // Recursively find stacked files
    function findStackedFiles(dir, list = []) {
      const files = fs.readdirSync(dir);
      

      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {

  // Ignore any folder named "process"
  if (file.toLowerCase() === 'process') return;

  findStackedFiles(fullPath, list);
  return;
}


        if (!/\.fit$|\.fits$/i.test(file)) return;

        const isStackedByName =
          file.startsWith('Stacked_') || file.startsWith('DSO_Stacked_');

        let isStackedByMetadata = false;

        try {
          const header = parseFitsHeader(fullPath);
          isStackedByMetadata = metadataIndicatesStacking(header);
        } catch (err) {
          console.warn(`Failed to read FITS header for ${file}`, err);
        }

        if (isStackedByName || isStackedByMetadata) {
          list.push(fullPath);
        }
      });

      return list;
    }

    const stackedFiles = findStackedFiles(dirPath);
    const total = stackedFiles.length;

    event.sender.send('organize-progress', {
      current: 0,
      total,
      status: 'Organizing stacked FITS files...'
    });

    const movedFiles = [];
    const targets = new Set();

    for (let i = 0; i < stackedFiles.length; i++) {
      if (cancelAllOperations) {
        cancelAllOperations = false;
        return { canceled: true, movedFiles };
      }

      const filePath = stackedFiles[i];
const filename = path.basename(filePath);
const parentDir = path.dirname(filePath);

// Create "Stacked" folder inside the file's own directory
const stackedDir = path.join(parentDir, 'Stacked');
if (!fs.existsSync(stackedDir)) {
  fs.mkdirSync(stackedDir, { recursive: true });
}

// Always move directly into /Stacked/
const destPath = path.join(stackedDir, filename);

try {
  fs.renameSync(filePath, destPath);
  movedFiles.push({ from: filePath, to: destPath });
} catch (err) {
  console.error(`Failed to move ${filePath}`, err);
}


      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
        event.sender.send('organize-progress', {
          current: i,
          total,
          status: `Moving files (${i}/${total})...`
        });
      }
    }

    // Final Progress Update
    event.sender.send('organize-progress', {
      current: total,
      total,
      status: 'Stacked file organization complete!'
    });

    return {
      success: true,
      movedFiles,
      targets: Array.from(targets),
      message: `Moved ${movedFiles.length} files into ${targets.size} target directories.`
    };

  } catch (err) {
    return { error: `Failed to organize stacked files: ${err.message}` };
  }
});

if (cancelAllOperations) {
    cancelAllOperations = false; // reset for next run
    return { canceled: true, deletedCount };
}

// Remove JPG handler
ipcMain.handle('remove-jpg', async (event, dirPath) => {
  cancelAllOperations = false;

  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };

  try {
    function findJpgFiles(dir, list = []) {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          findJpgFiles(fullPath, list);
        } else if (/\.(jpg|jpeg)$/i.test(file)) {
          list.push(fullPath);
        }
      });
      return list;
    }

    const jpgFiles = findJpgFiles(dirPath);
    const total = jpgFiles.length;

    event.sender.send('remove-progress', {
      current: 0,
      total,
      status: 'Starting JPG removal...'
    });

    let deletedCount = 0;

    for (let i = 0; i < jpgFiles.length; i++) {
      if (cancelAllOperations) {
        cancelAllOperations = false;
        return { canceled: true, deletedCount };
      }

      try {
        fs.unlinkSync(jpgFiles[i]);
        deletedCount++;
      } catch (err) {
        console.error(`Failed to delete ${jpgFiles[i]}`, err);
      }

      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
        event.sender.send('remove-progress', {
          current: i,
          total,
          status: `Deleting JPGs (${i}/${total})...`
        });
      }
    }

    event.sender.send('remove-progress', {
      current: total,
      total,
      status: 'JPG removal complete!'
    });

    return {
      success: true,
      deletedCount
    };

  } catch (err) {
    return { error: `Failed to remove JPG files: ${err.message}` };
  }
});

// Prep for Siril handler
ipcMain.handle('sirilprep', async (event, dirPath) => {
  cancelAllOperations = false;

  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };

  // Directories to skip (already organized)
  const skipDirs = new Set(['lights', 'darks', 'flats', 'bias', 'process', 'Stacked', 'stacked']);

  // Output folders
  const outDirs = {
    LIGHT: path.join(dirPath, 'lights'),
    DARK: path.join(dirPath, 'darks'),
    FLAT: path.join(dirPath, 'flats'),
    BIAS: path.join(dirPath, 'bias')
  };

  for (const key in outDirs) {
    if (!fs.existsSync(outDirs[key])) {
      fs.mkdirSync(outDirs[key], { recursive: true });
    }
  }

  // Recursively walk directory but skip already-organized folders
  function walk(dir, list = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);

      if (stat.isDirectory()) {
        if (!skipDirs.has(file.toLowerCase())) {
          walk(full, list);
        }
      } else if (/\.fit$|\.fits$/i.test(file)) {
        list.push(full);
      }
    }
    return list;
  }

  const fitsFiles = walk(dirPath);
  const total = fitsFiles.length;

  event.sender.send('sirilprep-progress', {
    current: 0,
    total,
    status: 'Scanning FITS files...'
  });

  const moved = [];
  const logEntries = [];

  function detectFrameType(header, filename) {
    // 1. Metadata-based detection
    let type = anyField(header, ['IMAGETYP', 'IMTYPE', 'FRAME', 'TYPE'], '').toUpperCase();

    if (type.includes('LIGHT')) return { type: 'LIGHT', method: 'metadata' };
    if (type.includes('DARK')) return { type: 'DARK', method: 'metadata' };
    if (type.includes('FLAT')) return { type: 'FLAT', method: 'metadata' };
    if (type.includes('BIAS')) return { type: 'BIAS', method: 'metadata' };

    // 2. Filename fallback
    const f = filename.toUpperCase();

    if (f.startsWith('LIGHT_')) return { type: 'LIGHT', method: 'filename' };
    if (f.startsWith('DARK_') || f.startsWith('DSO_DARK_')) return { type: 'DARK', method: 'filename' };
    if (f.startsWith('FLAT_') || f.startsWith('DSO_FLAT_')) return { type: 'FLAT', method: 'filename' };
    if (f.startsWith('BIAS_')) return { type: 'BIAS', method: 'filename' };

    return { type: null, method: null };
  }

  for (let i = 0; i < fitsFiles.length; i++) {
    if (cancelAllOperations) {
      cancelAllOperations = false;
      return { canceled: true, moved };
    }

    const filePath = fitsFiles[i];
    const filename = path.basename(filePath);

    let header = {};
    try {
      header = parseFitsHeader(filePath);
    } catch (err) {
      console.warn('Failed to read FITS header:', filePath);
    }

    const { type, method } = detectFrameType(header, filename);

    if (!type || !outDirs[type]) {
      continue; // Skip unknown types
    }

    const dest = path.join(outDirs[type], filename);

    try {
      fs.renameSync(filePath, dest);
      moved.push({ from: filePath, to: dest });

      logEntries.push({
        file: filename,
        from: filePath,
        to: dest,
        frameType: type,
        detectionMethod: method,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error(`Failed to move ${filePath}`, err);
    }

    if (i % 10 === 0) {
      await new Promise(resolve => setImmediate(resolve));
      event.sender.send('sirilprep-progress', {
        current: i,
        total,
        status: `Organizing files (${i}/${total})...`
      });
    }
  }

// Write log file as plain text
const logPath = path.join(dirPath, 'sirilprep-log.txt');
try {
  const lines = logEntries.map(entry => {
    return [
      `[${entry.timestamp}] ${entry.frameType.padEnd(5)} | ${entry.detectionMethod.padEnd(8)} | ${entry.file}`,
      `    FROM: ${entry.from}`,
      `    TO:   ${entry.to}`,
      ``
    ].join('\n');
  }).join('\n');

  fs.writeFileSync(logPath, lines, 'utf8');
} catch (err) {
  console.error('Failed to write log file:', err);
}


  event.sender.send('sirilprep-progress', {
    current: total,
    total,
    status: 'Siril Prep complete!'
  });

  return {
    success: true,
    moved,
    logPath,
    message: `Organized ${moved.length} files into lights/darks/flats/bias folders.`
  };
});

// Remove empty folders handler
ipcMain.handle('remove-empty-folders', async (event, dirPath) => {
  cancelAllOperations = false;
  message: 'Removing empty folders...';

  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };

  let deletedCount = 0;
  let totalFolders = 0;

  // First pass: count all folders for progress tracking
  function countFolders(folder) {
    if (cancelAllOperations) return;
    const entries = fs.readdirSync(folder, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        totalFolders++;
        countFolders(path.join(folder, entry.name));
      }
    }
  }

  // Second pass: delete empty folders bottom-up
  function removeEmpty(folder) {
    if (cancelAllOperations) return;

    const entries = fs.readdirSync(folder, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        removeEmpty(path.join(folder, entry.name));
      }
    }

    // After processing children, check if folder is empty
    const after = fs.readdirSync(folder);
    if (after.length === 0 && folder !== dirPath) {
      fs.rmdirSync(folder);
      deletedCount++;

      event.sender.send('remove-empty-folders-progress', {
        deletedCount,
        totalFolders
      });
    }
  }

  try {
    countFolders(dirPath);
    removeEmpty(dirPath);

    if (cancelAllOperations) {
      return { canceled: true, message: 'Operation canceled.' };
    }

    return {
      message: `Removed ${deletedCount} empty folder(s).`,
      deletedCount
    };

  } catch (err) {
    return { error: err.message };
  }
});




