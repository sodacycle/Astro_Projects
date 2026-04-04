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
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      walkDirectory(fullPath, filelist);
    } else if (/\.fit$|\.fits$/i.test(file) && !file.startsWith('Stacked_')) {
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

let cancelAllOperations = false;
// let cancelCurrentScan = false;

ipcMain.handle('cancel-all', () => {
  cancelAllOperations = true;
  return { canceled: true };
});


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
    'Summed Integration Time s': Number(v.totalExposure.toFixed(3))
  }));

  event.sender.send('scan-progress', { current: totalFiles, total: totalFiles, status: 'Complete!' });

  return { metadataList, targetSummary };
});

// Organize Stacked_ files handler
ipcMain.handle('organize-stacked', async (event, dirPath) => {
  cancelAllOperations = false;

  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };

  try {
    // Recursively find all Stacked_ files
    function findStackedFiles(dir, list = []) {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          findStackedFiles(fullPath, list);
        } else if (/\.fit$|\.fits$/i.test(file) && file.startsWith('Stacked_')) {
          list.push(fullPath);
        }
      });
      return list;
    }

    // Create Stacked_ directory
    const stackedDir = path.join(dirPath, 'Stacked_');
    if (!fs.existsSync(stackedDir)) {
      fs.mkdirSync(stackedDir, { recursive: true });
    }

    const stackedFiles = findStackedFiles(dirPath);
    const total = stackedFiles.length;

    // Send initial progress
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

      // Extract target name
      const match = filename.match(/^Stacked_\d+_(.+?)_\d+\.\d+s/);
      if (!match) continue;

      const targetName = match[1].replace(/_/g, ' ');
      targets.add(targetName);

      const targetDir = path.join(stackedDir, targetName);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const destPath = path.join(targetDir, filename);

      // MOVE instead of copy
      try {
        fs.renameSync(filePath, destPath);
        movedFiles.push({ from: filePath, to: destPath });
      } catch (err) {
        console.error(`Failed to move ${filePath}`, err);
      }

      // Progress update every 10 files
      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
        event.sender.send('organize-progress', {
          current: i,
          total,
          status: `Moving files (${i}/${total})...`
        });
      }
    }

    // Final progress update
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

// let cancelRemoveJpg = false;

if (cancelAllOperations) {
    cancelAllOperations = false; // reset for next run
    return { canceled: true, deletedCount };
}

//remove JPG handler
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

// Prep for Siril handler (placeholder for now)
ipcMain.handle('sirilprep', async (event, dirPath) => {
  cancelAllOperations = false;

  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };

  try {
    // Recursively find all Light* files
    function findLightFiles(dir, list = []) {
      const files = fs.readdirSync(dir);
      files.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          findLightFiles(fullPath, list);
        } else if (/^Light/i.test(file)) {
          list.push(fullPath);
        }
      });
      return list;
    }

    const lightFiles = findLightFiles(dirPath);
    const total = lightFiles.length;

    event.sender.send('sirilprep-progress', {
      current: 0,
      total,
      status: 'Preparing Light frames...'
    });

    let movedCount = 0;

    for (let i = 0; i < lightFiles.length; i++) {
      if (cancelAllOperations) {
        cancelAllOperations = false;
        return { canceled: true, movedCount };
      }

      const filePath = lightFiles[i];
      const parentDir = path.dirname(filePath);
      const lightsDir = path.join(parentDir, 'lights');

      if (!fs.existsSync(lightsDir)) {
        fs.mkdirSync(lightsDir, { recursive: true });
      }

      const destPath = path.join(lightsDir, path.basename(filePath));

      try {
        fs.renameSync(filePath, destPath); // MOVE
        movedCount++;
      } catch (err) {
        console.error(`Failed to move ${filePath}`, err);
      }

      if (i % 10 === 0) {
        await new Promise(resolve => setImmediate(resolve));
        event.sender.send('sirilprep-progress', {
          current: i,
          total,
          status: `Moving Light frames (${i}/${total})...`
        });
      }
    }

    event.sender.send('sirilprep-progress', {
      current: total,
      total,
      status: 'Light frame organization complete!'
    });

    return {
      success: true,
      movedCount,
      message: `Moved ${movedCount} Light frames into lights/ subdirectories.`
    };

  } catch (err) {
    return { error: `Failed to prepare Light frames: ${err.message}` };
  }
});



