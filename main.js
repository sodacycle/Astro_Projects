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
 
// ─── Constants ────────────────────────────────────────────────────────────────
 
// Known stacking software names (case-insensitive).
// FIX: Removed 'app' and 'dss' — too short and generic, caused false positives
// on paths, camera names, and unrelated field values.
// 'astropixelprocessor' covers APP; 'deepskystacker' covers DSS.
const STACKING_SOFTWARE = [
  'siril',
  'deepskystacker',
  'pixinsight',
  'astropixelprocessor',
  'autostakkert',
  'registax',
  'sequator',
  'starry landscape stacker'
];
 
// Folder names created by organize-stacked and sirilprep — never walk into these.
// Single source of truth used by walkDirectory, findStackedFiles, and sirilprep walk.
//const SKIP_DIR_NAMES = new Set(['stacked', 'process', 'lights', 'darks', 'flats', 'bias']);
 
// Directories skipped during FITS scanning
const SCAN_SKIP_DIRS = new Set(['stacked', 'process', 'darks', 'flats', 'bias']);
 
// Directories skipped during file organization
const PROCESS_SKIP_DIRS = new Set(['stacked', 'process', 'darks', 'flats', 'bias', 'lights']);
 
// ─── Helpers ──────────────────────────────────────────────────────────────────
 
// Check FITS metadata to determine if a file is a stacked result.
// FIX: STACKING_SOFTWARE is now defined above this function so it is never
// referenced before initialization (previously caused a potential ReferenceError).
//
// Two-stage approach to avoid false positives from capture software:
//   Stage 1 — Unambiguous stacking fields: if any are present the file is
//             definitively a stack. No software name matching needed.
//   Stage 2 — Software name fields: only checked on headers that don't have
//             a CREATOR field, since CREATOR is written by capture software
//             (NINA, SGP, KStars) and causes false positives.
function metadataIndicatesStacking(header) {
  if (!header) return false;
 
  // Stage 1a: A stack count > 1 is definitive — raw frames are always 1
  const stackCountKeys = ['STACKCNT', 'NFRAMES', 'NSTACK', 'FRAMES'];
  for (const key of stackCountKeys) {
    if (header[key] !== undefined && Number(header[key]) > 1) return true;
  }
 
  // Stage 1b: These keys are written exclusively by stacking software output
  const stackFlagKeys = ['STACKTYP', 'STACKED', 'COMBINED'];
  for (const key of stackFlagKeys) {
    if (header[key] !== undefined && header[key] !== null) return true;
  }
 
  // Stage 2: Software name matching — bail out if CREATOR is present since
  // that field belongs to the capture application, not the stacker
  if (header['CREATOR'] !== undefined) return false;
 
  const softwareKeys = ['PROGRAM', 'SOFTWARE', 'HISTORY', 'COMMENT'];
  for (const key of softwareKeys) {
    const value = header[key];
    if (!value) continue;
    const lower = String(value).toLowerCase();
    if (STACKING_SOFTWARE.some(name => lower.includes(name))) return true;
  }
 
  return false;
}
 
function anyField(header, keys, fallback = 'Unknown') {
  for (const key of keys) {
    if (header[key] !== undefined && header[key] !== null && header[key] !== '') {
      return header[key];
    }
  }
  return fallback;
}
 
function formatHMS(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const h = hours > 0 ? `${hours}h ` : '';
  const m = minutes > 0 ? `${minutes}m ` : '';
  const s = `${seconds}s`;
  return `${h}${m}${s}`.trim();
}
 
// ─── Walk ─────────────────────────────────────────────────────────────────────

// Async generator that yields { filePath, header } one file at a time.
// Replaces the old synchronous walkDirectory — the event loop is never blocked
// for more than one file so the progress bar starts moving immediately and the
// Stop button stays responsive throughout the entire walk.
async function* walkDirectoryGen(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn('Cannot read directory:', dir, err.message);
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SCAN_SKIP_DIRS.has(entry.name.toLowerCase())) {
        yield* walkDirectoryGen(path.join(dir, entry.name));
      }
      continue;
    }

    if (!/\.fit$|\.fits$/i.test(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    // Yield to the event loop between every file so IPC messages (progress,
    // cancel) are processed without waiting for the whole walk to finish.
    await new Promise(resolve => setImmediate(resolve));

    let header = null;
    let isStacked = false;
    try {
      header = parseFitsHeader(fullPath);
      isStacked = metadataIndicatesStacking(header);
    } catch (err) {
      // Header unreadable — fall through to filename check
    }

    if (!isStacked) {
      isStacked = entry.name.startsWith('Stacked_') || entry.name.startsWith('DSO_Stacked_');
    }

    if (!isStacked) {
      yield { filePath: fullPath, header };
    }
  }
}

// ─── State ────────────────────────────────────────────────────────────────────
 
let cancelAllOperations = false;
 
ipcMain.handle('cancel-all', () => {
  cancelAllOperations = true;
  return { canceled: true };
});
 
// ─── IPC: select-directory ────────────────────────────────────────────────────
ipcMain.handle('select-directory', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});
 
// ─── IPC: scan-fits ───────────────────────────────────────────────────────────
ipcMain.handle('scan-fits', async (event, dirPath) => {
  cancelAllOperations = false;
  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };

  const metadataList = [];
  let fileCount = 0;

  // Send an early progress ping so the UI shows activity immediately.
  // Total is unknown until the walk completes, so we stream progress as we go.
  event.sender.send('scan-progress', { current: 0, total: 0, status: 'Scanning files...' });

  for await (const { filePath, header: cachedHeader } of walkDirectoryGen(dirPath)) {
    if (cancelAllOperations) {
      cancelAllOperations = false;
      return { canceled: true, metadataList, targetSummary: [] };
    }

    fileCount++;

    // Progress update every 10 files. The generator already yields between files
    // so no extra setImmediate is needed here.
    if (fileCount % 10 === 0) {
      event.sender.send('scan-progress', {
        current: fileCount,
        total: fileCount, // total unknown during streaming walk; bar fills progressively
        status: `Processing file ${fileCount}...`
      });
    }

    try {
      const header = cachedHeader || parseFitsHeader(filePath);
      const filename = path.basename(filePath);

      let finalTarget = 'Unknown';
      const filenameMatch = filename.match(/^Light_(.+?)_\d+\.\d+s_/);
      if (filenameMatch) {
        finalTarget = filenameMatch[1].replace(/_/g, ' ');
      } else {
        finalTarget = anyField(header, ['OBJECT', 'TARGET', 'TITLE'], 'Unknown');
      }

      const exposureTime = Number(anyField(header, ['EXPTIME', 'EXPOSURE', 'EXPOSURE_TIME'], 0));
      const numSubs = Number(anyField(header, ['STACKCNT', 'NFRAMES', 'NSTACK', 'FRAMES'], 1));

      const totalExposure = header['TOTALEXP'] !== undefined
        ? Number(header['TOTALEXP'])
        : (numSubs && exposureTime ? numSubs * exposureTime : 0);

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
        File: filename,
        Path: filePath,
        Target: finalTarget,
        'Start Time UTC': convertedStart,
        'End Time UTC': convertedEnd,
        'Exposure Time s': exposureTime,
        'Number of Subs': numSubs,
        'Total Exposure Time s': totalExposure,
        Telescope: telescopeDisplay,
        'Camera Model': cameraModel,
        'Sensor Temperature C': anyField(header, ['CCD-TEMP', 'CCD_TEMP'], 'Unknown'),
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

  event.sender.send('scan-progress', { current: fileCount, total: fileCount, status: 'Aggregating data...' });

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

  event.sender.send('scan-progress', { current: fileCount, total: fileCount, status: 'Complete!' });

  return { metadataList, targetSummary };
});

// ─── IPC: organize-stacked ────────────────────────────────────────────────────
ipcMain.handle('organize-stacked', async (event, dirPath) => {
  cancelAllOperations = false;
 
  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };
 
  try {
    function findStackedFiles(dir, list = []) {
      const entries = fs.readdirSync(dir);
 
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stats = fs.statSync(fullPath);
 
        if (stats.isDirectory()) {
          if (PROCESS_SKIP_DIRS.has(entry.toLowerCase())) continue;
          findStackedFiles(fullPath, list);
          continue;
        }
 
        if (!/\.fit$|\.fits$/i.test(entry)) continue;
 
        // Stage 1: Metadata-based detection
        let isStacked = false;
        try {
          const header = parseFitsHeader(fullPath);
          isStacked = metadataIndicatesStacking(header);
        } catch (err) {
          console.warn(`Failed to read FITS header for ${entry}`, err);
        }
 
        // Stage 2: Filename fallback
        if (!isStacked) {
          isStacked = entry.startsWith('Stacked_') || entry.startsWith('DSO_Stacked_');
        }
 
        if (isStacked) list.push(fullPath);
      }
 
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
 
    for (let i = 0; i < stackedFiles.length; i++) {
      if (cancelAllOperations) {
        cancelAllOperations = false;
        return { canceled: true, movedFiles };
      }
 
      const filePath = stackedFiles[i];
      const filename = path.basename(filePath);
      const parentDir = path.dirname(filePath);
 
      // Safety net: skip if the file is already inside a Stacked folder
      if (path.basename(parentDir).toLowerCase() === 'stacked') {
        console.warn(`Skipping already-organized file: ${filePath}`);
        continue;
      }
 
      const stackedDir = path.join(parentDir, 'Stacked');
      if (!fs.existsSync(stackedDir)) {
        fs.mkdirSync(stackedDir, { recursive: true });
      }
 
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
 
    event.sender.send('organize-progress', {
      current: total,
      total,
      status: 'Stacked file organization complete!'
    });
 
    return {
      success: true,
      movedFiles,
      message: `Moved ${movedFiles.length} stacked files into their local Stacked folders.`
    };
 
  } catch (err) {
    return { error: `Failed to organize stacked files: ${err.message}` };
  }
});
 
// ─── IPC: remove-jpg ──────────────────────────────────────────────────────────
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
 
    return { success: true, deletedCount };
 
  } catch (err) {
    return { error: `Failed to remove JPG files: ${err.message}` };
  }
});
 
// ─── IPC: sirilprep ───────────────────────────────────────────────────────────
ipcMain.handle('sirilprep', async (event, dirPath) => {
  cancelAllOperations = false;
 
  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };
 
  function walk(dir, list = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (!PROCESS_SKIP_DIRS.has(file.toLowerCase())) {
          walk(full, list);
        }
      } else if (/\.fit$|\.fits$/i.test(file)) {
        list.push(full);
      }
    }
    return list;
  }
 
  function detectFrameType(header, filename) {
    // Metadata first
    const type = anyField(header, ['IMAGETYP', 'IMTYPE', 'FRAME', 'TYPE'], '').toUpperCase();
    if (type.includes('LIGHT')) return { type: 'LIGHT', method: 'metadata' };
    if (type.includes('DARK'))  return { type: 'DARK',  method: 'metadata' };
    if (type.includes('FLAT'))  return { type: 'FLAT',  method: 'metadata' };
    if (type.includes('BIAS'))  return { type: 'BIAS',  method: 'metadata' };
 
    // Filename fallback — Stage 1: strict prefix matching (e.g. NINA/SGP style)
    const f = filename.toUpperCase();
    if (f.startsWith('LIGHT_'))                               return { type: 'LIGHT', method: 'filename' };
    if (f.startsWith('DARK_')  || f.startsWith('DSO_DARK_')) return { type: 'DARK',  method: 'filename' };
    if (f.startsWith('FLAT_')  || f.startsWith('DSO_FLAT_')) return { type: 'FLAT',  method: 'filename' };
    if (f.startsWith('BIAS_'))                                return { type: 'BIAS',  method: 'filename' };
 
    // Filename fallback — Stage 2: substring matching for cameras like DWARF 3
    // that embed the frame type as a word anywhere in the filename.
    // Normalize: strip extension, uppercase, replace every non-alpha char
    // (underscores, digits, spaces, parens, hyphens) with a space so \b
    // word boundaries work reliably on all naming styles.
    const stem = f.replace(/\.FITS?$/, '').replace(/[^A-Z]+/g, ' ').trim();
    const hasWord = (word) => new RegExp("\\b" + word + "\\b").test(stem);
    if (hasWord('LIGHT') || hasWord('LIGHTS'))  return { type: 'LIGHT', method: 'filename-substring' };
    if (hasWord('DARK')  || hasWord('DARKS'))   return { type: 'DARK',  method: 'filename-substring' };
    if (hasWord('FLAT')  || hasWord('FLATS'))   return { type: 'FLAT',  method: 'filename-substring' };
    if (hasWord('BIAS')  || hasWord('BIASES'))  return { type: 'BIAS',  method: 'filename-substring' };
 
    return { type: null, method: null };
  }
 
  const subfolderName = {
    LIGHT: 'lights',
    DARK:  'darks',
    FLAT:  'flats',
    BIAS:  'bias'
  };
 
  const fitsFiles = walk(dirPath);
  const total = fitsFiles.length;
 
  event.sender.send('sirilprep-progress', { current: 0, total, status: 'Scanning FITS files...' });
 
  const moved = [];
  const logEntries = [];
 
  for (let i = 0; i < fitsFiles.length; i++) {
    if (cancelAllOperations) {
      cancelAllOperations = false;
      return { canceled: true, movedCount: moved.length };
    }
 
    const filePath = fitsFiles[i];
    const filename = path.basename(filePath);
    const fileParentDir = path.dirname(filePath);
 
    let header = {};
    try {
      header = parseFitsHeader(filePath);
    } catch (err) {
      console.warn('Failed to read FITS header:', filePath);
    }
 
    const { type, method } = detectFrameType(header, filename);
    if (!type) continue;
 
    // Destination is relative to this file's own parent — not the root dirPath
    const destDir = path.join(fileParentDir, subfolderName[type]);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
 
    const dest = path.join(destDir, filename);
 
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
 
  const logPath = path.join(dirPath, 'sirilprep-log.txt');
  try {
    const lines = logEntries.map(entry => [
      `[${entry.timestamp}] ${entry.frameType.padEnd(5)} | ${entry.detectionMethod.padEnd(8)} | ${entry.file}`,
      `    FROM: ${entry.from}`,
      `    TO:   ${entry.to}`,
      ``
    ].join('\n')).join('\n');
    fs.writeFileSync(logPath, lines, 'utf8');
  } catch (err) {
    console.error('Failed to write log file:', err);
  }
 
  event.sender.send('sirilprep-progress', { current: total, total, status: 'Siril Prep complete!' });
 
  return {
    success: true,
    movedCount: moved.length,
    logPath,
    message: `Organized ${moved.length} files into per-folder lights/darks/flats/bias subfolders.`
  };
});
 
// ─── IPC: remove-empty-folders ────────────────────────────────────────────────
ipcMain.handle('remove-empty-folders', async (event, dirPath) => {
  cancelAllOperations = false;
 
  // FIX: Removed the dead labeled statement `message: '...'` that was here —
  // it was valid JS syntax but did absolutely nothing.
 
  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };
 
  let deletedCount = 0;
 
  // FIX: removeEmpty is now async with setImmediate yields so the event loop
  // can process the cancel-all IPC message during large folder trees.
  // Previously the synchronous recursion made the stop button unresponsive
  // until the entire tree had been walked.
  async function removeEmpty(folder) {
    if (cancelAllOperations) return;
 
    const entries = fs.readdirSync(folder, { withFileTypes: true });
 
    for (const entry of entries) {
      if (cancelAllOperations) return;
      if (entry.isDirectory()) {
        await removeEmpty(path.join(folder, entry.name));
      }
    }
 
    // Yield to allow cancel-all IPC message to be processed between folders
    await new Promise(resolve => setImmediate(resolve));
 
    if (cancelAllOperations) return;
 
    // After processing all children, check if this folder is now empty
    const after = fs.readdirSync(folder);
    if (after.length === 0 && folder !== dirPath) {
      try {
        fs.rmdirSync(folder);
        deletedCount++;
        event.sender.send('remove-empty-folders-progress', { deletedCount });
      } catch (err) {
        console.error(`Failed to remove folder ${folder}`, err);
      }
    }
  }
 
  try {
    await removeEmpty(dirPath);
 
    if (cancelAllOperations) {
      cancelAllOperations = false;
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