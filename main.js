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

let cancelCurrentScan = false;

ipcMain.handle('cancel-scan', () => {
  cancelCurrentScan = true;
  return { canceled: true };
});

ipcMain.handle('scan-fits', async (event, dirPath) => {
  cancelCurrentScan = false;
  if (!dirPath) return { error: 'No directory path provided.' };
  if (!fs.existsSync(dirPath)) return { error: 'Directory not found.' };

  const fitFiles = walkDirectory(dirPath);
  const metadataList = [];
  const totalFiles = fitFiles.length;

  event.sender.send('scan-progress', { current: 0, total: totalFiles, status: 'Starting scan...' });

  for (let i = 0; i < fitFiles.length; i++) {
    if (cancelCurrentScan) {
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
        'Stacking Software': anyField(header, ['CREATOR', 'SOFTWARE', 'STACKING_SOFTWARE'], 'Unknown'),
        'Raw Header': JSON.stringify(header)
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
