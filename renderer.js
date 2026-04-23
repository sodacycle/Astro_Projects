const selectBtn = document.getElementById('selectDir');
const scanBtn = document.getElementById('scanBtn');
const stopBtn = document.getElementById('stopBtn');
const organizeBtn = document.getElementById('organizeBtn');
const removejpgBtn = document.getElementById('removejpgBtn');
const sirilprepBtn = document.getElementById('sirilprepBtn');
const removeemptyBtn = document.getElementById('removeemptyBtn');
const pathDisp = document.getElementById('selectedPath');
const status = document.getElementById('status');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const summaryArea = document.getElementById('summary');
const detailsArea = document.getElementById('details');

let selectedDirectory = null;

selectBtn.addEventListener('click', async () => {
  const dir = await window.electronAPI.selectDirectory();
  if (dir) {
    selectedDirectory = dir;
    pathDisp.textContent = dir;
    status.textContent = 'Directory selected. Ready to scan.';
  } else {
    status.textContent = 'No directory selected';
  }
});

// Scan FITS handler
scanBtn.addEventListener('click', async () => {
  if (!selectedDirectory) {
    status.textContent = 'Please select a directory first.';
    return;
  }

  // Clear previous results
  summaryArea.innerHTML = '';
  detailsArea.innerHTML = '';

  status.textContent = 'Scanning FITS files... This may take a while for large directories.';
  progressContainer.style.display = 'block';
  progressBar.value = 0;
  progressText.textContent = 'Starting...';
  scanBtn.disabled = true;
  stopBtn.disabled = false;

  window.electronAPI.onScanProgress((event, progress) => {
    // During streaming walk total is unknown; show file count in status.
    // When total===current at end, progress.total > 0 and bar snaps to full.
    if (progress.total > 0) {
      progressBar.value = 100;
      progressBar.max = 100;
    } else {
      progressBar.removeAttribute('value'); // indeterminate while streaming
    }
    progressText.textContent = progress.status;
  });

  const result = await window.electronAPI.scanFits(selectedDirectory);

  progressContainer.style.display = 'none';
  scanBtn.disabled = false;
  stopBtn.disabled = true;

  if (result.error) {
    status.textContent = `Error: ${result.error}`;
    return;
  }

  if (result.canceled) {
    status.textContent = 'Scan canceled by user.';
    summaryArea.innerHTML = '';
    detailsArea.innerHTML = '';
    return;
  }

  status.textContent = `Found ${result.metadataList.length} FITS files.`;

  
summaryArea.innerHTML = createTableHTML(result.targetSummary, ['Target', 'FITS Count', 'Files With Exposure', 'Total Integration Time']);
targetSummary = result.targetSummary;
renderCatalogBreakdown(result.targetSummary);
renderCalibrationSummary(result.calibrationSummary);
renderImagingCalendar(result.metadataList);
fullMetadataList = result.metadataList;
detailsArea.innerHTML = createTableHTML(result.metadataList, [
    'Frame Type', 'File', 'Target', 'Start Time UTC', 'End Time UTC', 'Exposure Time s', 'Number of Subs', 'Total Exposure Time s',
    'Telescope', 'Camera Model', 'Sensor Temperature C', 'RA', 'DEC',
    'Latitude', 'Longitude', 'Binning', 'Filter Used', 'Gain',
    'Focal Length mm', 'Aperture mm', 'Focus Position', 'Image Type', 'Stacking Software'
  ]);

  organizeBtn.disabled = false;
  removejpgBtn.disabled = false;
  sirilprepBtn.disabled = false;
  removeemptyBtn.disabled = false;
  document.getElementById('showAllFiles').style.display = 'inline-block';
});

document.getElementById('showAllFiles').addEventListener('click', () => {
  currentCatalogFilter = null;
  renderCalendar();
  detailsArea.innerHTML = '<p>Loading...</p>';
  detailsArea.classList.add('loading');
  requestAnimationFrame(() => {
    setTimeout(() => {
      detailsArea.classList.remove('loading');
      detailsArea.innerHTML = createTableHTML(fullMetadataList, [
          'Frame Type', 'File', 'Target', 'Start Time UTC', 'End Time UTC', 'Exposure Time s', 'Number of Subs', 'Total Exposure Time s',
          'Telescope', 'Camera Model', 'Sensor Temperature C', 'RA', 'DEC',
          'Latitude', 'Longitude', 'Binning', 'Filter Used', 'Gain',
          'Focal Length mm', 'Aperture mm', 'Focus Position', 'Image Type', 'Stacking Software'
        ]);
      }, 0);
    });
});

// Stops current task
stopBtn.addEventListener('click', async () => {
  await window.electronAPI.cancelAll();
  status.textContent = 'Cancel requested; waiting for operation to stop...';
  stopBtn.disabled = true;
});

// Organize Stacked_ files handler
organizeBtn.addEventListener('click', async () => {
  if (!selectedDirectory) {
    status.textContent = 'Please select a directory first.';
    return;
  }

  progressContainer.style.display = 'block';
  progressBar.value = 0;
  progressText.textContent = "Beginning to move Stacked files...";
  stopBtn.disabled = false;

  const result = await window.electronAPI.organizeStacked(selectedDirectory);

  stopBtn.disabled = true;
  progressContainer.style.display = 'none';

  if (result.error) {
    status.textContent = `Error: ${result.error}`;
    return;
  }

  if (result.canceled) {
    status.textContent = `Organization canceled. Moved ${result.movedFiles.length} files.`;
    return;
  }

  status.textContent = result.message;
  progressText.textContent = `Moved ${result.movedFiles.length} files.`;
});

// Remove JPG handler
removejpgBtn.addEventListener('click', async () => {
  if (!selectedDirectory) {
    alert("Please select a directory first.");
    return;
  }

  // Show progress bar
  progressContainer.style.display = 'block';
  progressBar.value = 0;
  progressText.textContent = "Starting JPG removal... This may take a while..";
  stopBtn.disabled = false;

  // Listen for progress events
  window.electronAPI.onRemoveProgress((event, data) => {
    progressBar.value = (data.current / data.total) * 100;
    progressText.textContent = data.status;
  });

  window.electronAPI.onOrganizeProgress((event, data) => {
  progressContainer.style.display = 'block';
  progressBar.value = (data.current / data.total) * 100;
  progressText.textContent = data.status;
});


  const result = await window.electronAPI.removeJpg(selectedDirectory);

  stopBtn.disabled = true;
  progressContainer.style.display = 'none';

  if (result.error) {
    alert(`Error: ${result.error}`);
    return;
  }

  if (result.canceled) {
    alert(`JPG removal canceled. Deleted ${result.deletedCount} files.`);
    return;
  }
progressText.textContent = `Deleted ${result.deletedCount} JPG/JPEG files.`;
  alert(`Deleted ${result.deletedCount} JPG/JPEG files.`);
});

// Prep for Siril handler
sirilprepBtn.addEventListener('click', async () => {
  if (!selectedDirectory) {
    status.textContent = 'Please select a directory first.';
    return;
  }

  progressContainer.style.display = 'block';
  progressBar.value = 0;
  progressText.textContent = "Moving files into subdirectories...";
  stopBtn.disabled = false;

  window.electronAPI.onSirilprepProgress((event, data) => {
    progressBar.value = (data.current / data.total) * 100;
    progressText.textContent = data.status;
  });

  const result = await window.electronAPI.sirilprep(selectedDirectory);

  stopBtn.disabled = true;
  progressContainer.style.display = 'none';

  if (result.error) {
    status.textContent = `Error: ${result.error}`;
    return;
  }

  if (result.canceled) {
    status.textContent = `Siril stacking preparation canceled. Moved ${result.movedCount} files.`;
    return;
  }

  progressText.textContent = `Moved ${result.movedCount} files into lights subdirectories.`;
  status.textContent = result.message;
});

// Register progress listener ONCE
window.electronAPI.onRemoveEmptyFoldersProgress((event, data) => {
  const { deletedCount } = data;
  progressBar.value = deletedCount;
  progressText.textContent = `Removed ${deletedCount} empty folders...`;
});

// Remove empty folders handler
removeemptyBtn.addEventListener('click', async () => {
  if (!selectedDirectory) {
    status.textContent = 'Please select a directory first.';
    return;
  }

  progressContainer.style.display = 'block';
  progressBar.value = 0;
  progressText.textContent = "Starting empty folder removal...";
  stopBtn.disabled = false;

  const result = await window.electronAPI.removeEmptyFolders(selectedDirectory);

  stopBtn.disabled = true;
  progressContainer.style.display = 'none';

  if (result.error) {
    status.textContent = `Error: ${result.error}`;
    return;
  }

  if (result.canceled) {
    status.textContent = `Empty folder removal canceled.`;
    return;
  }

  status.textContent = result.message;
});


function createTableHTML(data, columns) {
  if (!data || data.length === 0) return '<p>No data to show.</p>';
  const colCount = columns.length;
  const th = columns.map((c) => `<th>${c}</th>`).join('');
  let rowsHtml = '';
  for (let i = 0, len = data.length; i < len; i++) {
    const row = data[i];
    let cells = '';
    for (let j = 0; j < colCount; j++) {
      cells += `<td>${row[columns[j]] ?? ''}</td>`;
    }
    rowsHtml += `<tr>${cells}</tr>`;
  }
  return `<table><thead><tr>${th}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
}

// Creates Calibration Frame Summary (darks, flats, bias)
function renderCalibrationSummary(rows) {
  const div = document.getElementById('calibrationSummary');
  if (!div) return;
  if (!rows || rows.length === 0) {
    div.innerHTML = '<p>No calibration frames found.</p>';
    return;
  }
  div.innerHTML = createTableHTML(rows, [
    'Frame Type', 'Exposure Time s', 'Gain', 'Binning', 'Sensor Temp C', 'Count', 'Most Recent'
  ]);
}

// Creates Catalog Summary
function renderCatalogBreakdown(summaryGroups) {
  const catalogDiv = document.getElementById("catalogBreakdown");
  if (!catalogDiv) return;

  const catalogCounts = {
    Messier: 0,
    NGC: 0,
    IC: 0,
    Caldwell: 0,
    Sharpless: 0,
    Barnard: 0,
    LDN: 0,
    LBN: 0,
    Abell: 0,
    PGC: 0,
    UGC: 0,
    Other: 0
  };

  summaryGroups.forEach(group => {
    let name = (group.Target || "").toUpperCase().trim();

    // Remove mosaic descriptors
    name = name
      .replace(/MOSAIC/g, "")
      .replace(/PANEL/g, "")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Catalog detection
    if (name.startsWith("M ")) catalogCounts.Messier++;
    else if (name.startsWith("NGC")) catalogCounts.NGC++;
    else if (name.startsWith("IC")) catalogCounts.IC++;
    else if (name.startsWith("CALDWELL")) catalogCounts.Caldwell++;
    else if (name.startsWith("SH") || name.startsWith("SH2")) catalogCounts.Sharpless++;
    else if (name.startsWith("BARNARD") || name.startsWith("B ")) catalogCounts.Barnard++;
    else if (name.startsWith("LDN")) catalogCounts.LDN++;
    else if (name.startsWith("LBN")) catalogCounts.LBN++;
    else if (name.startsWith("ABELL")) catalogCounts.Abell++;
    else if (name.startsWith("PGC")) catalogCounts.PGC++;
    else if (name.startsWith("UGC")) catalogCounts.UGC++;
    else catalogCounts.Other++;
  });

  let html = "<table><thead><tr><th>Catalog</th><th>Count</th></tr></thead><tbody>";

  Object.entries(catalogCounts).forEach(([catalog, count]) => {
    html += `
      <tr class="catalog-row" data-catalog="${catalog}" style="cursor: pointer;">
        <td>${catalog}</td>
        <td>${count}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";

  catalogDiv.innerHTML = html;

  document.querySelectorAll('.catalog-row').forEach(el => {
    el.addEventListener('click', () => {
      const catalog = el.dataset.catalog;
      currentCatalogFilter = catalog;
      renderCalendar(true);
      detailsArea.innerHTML = '<p>Loading...</p>';
      requestAnimationFrame(() => {
        setTimeout(() => {
          const filteredMetadata = fullMetadataList.filter(item => {
            const name = (item['Target'] || "").toUpperCase().trim();
            const cleanName = name.replace(/MOSAIC/g, "").replace(/PANEL/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
            switch (catalog) {
              case 'Messier': return cleanName.startsWith("M ");
              case 'NGC': return cleanName.startsWith("NGC");
              case 'IC': return cleanName.startsWith("IC");
              case 'Caldwell': return cleanName.startsWith("CALDWELL");
              case 'Sharpless': return cleanName.startsWith("SH") || cleanName.startsWith("SH2");
              case 'Barnard': return cleanName.startsWith("BARNARD") || cleanName.startsWith("B ");
              case 'LDN': return cleanName.startsWith("LDN");
              case 'LBN': return cleanName.startsWith("LBN");
              case 'Abell': return cleanName.startsWith("ABELL");
              case 'PGC': return cleanName.startsWith("PGC");
              case 'UGC': return cleanName.startsWith("UGC");
              case 'Other': return !cleanName.startsWith("M ") && !cleanName.startsWith("NGC") && !cleanName.startsWith("IC") && !cleanName.startsWith("CALDWELL") && !cleanName.startsWith("SH") && !cleanName.startsWith("SH2") && !cleanName.startsWith("BARNARD") && !cleanName.startsWith("B ") && !cleanName.startsWith("LDN") && !cleanName.startsWith("LBN") && !cleanName.startsWith("ABELL") && !cleanName.startsWith("PGC") && !cleanName.startsWith("UGC");
              default: return false;
            }
          });
          detailsArea.innerHTML = createTableHTML(filteredMetadata, [
            'Frame Type', 'File', 'Target', 'Start Time UTC', 'End Time UTC', 'Exposure Time s', 'Number of Subs', 'Total Exposure Time s',
            'Telescope', 'Camera Model', 'Sensor Temperature C', 'RA', 'DEC',
            'Latitude', 'Longitude', 'Binning', 'Filter Used', 'Gain',
            'Focal Length mm', 'Aperture mm', 'Focus Position', 'Image Type', 'Stacking Software'
          ]);
        }, 0);
      });
    });
  });
}

let imagingData = [];
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();
let calendarListenersAdded = false;
let currentMetadataList = [];
let fullMetadataList = [];
let targetSummary = [];
let currentCatalogFilter = null;
let siteLocation = null;
let weatherCache = {};
let useCelsius = localStorage.getItem('use_celsius') === 'true';

function toggleTempUnit() {
  useCelsius = !useCelsius;
  localStorage.setItem('use_celsius', useCelsius);
  const btn = document.getElementById('tempToggle');
  if (btn) btn.textContent = useCelsius ? '°F' : '°C';
  renderCalendar();
}

function initTempToggle() {
  const btn = document.getElementById('tempToggle');
  if (btn) {
    btn.textContent = useCelsius ? '°F' : '°C';
    btn.addEventListener('click', toggleTempUnit);
  }
}

async function fetchSiteLocation(metadataList) {
  for (const item of metadataList) {
    const lat = item['Latitude'];
    const lon = item['Longitude'];
    if (lat && lon && lat !== 'Unknown' && lon !== 'Unknown') {
      const latNum = parseFloat(lat);
      const lonNum = parseFloat(lon);
      if (!isNaN(latNum) && !isNaN(lonNum)) {
        siteLocation = { lat: latNum, lon: lonNum };
        return;
      }
    }
  }
}

async function fetchWeatherForecast() {
  if (!siteLocation) {
    const cached = localStorage.getItem('astro_site_location');
    if (cached) {
      siteLocation = JSON.parse(cached);
    }
  }
  if (!siteLocation) return;
  const { lat, lon } = siteLocation;
  localStorage.setItem('astro_site_location', JSON.stringify({ lat, lon }));
  
  weatherCache = {};
  
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1);
  const startOfMonth = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}-01`;
  
  try {
    if (startOfMonth < todayStr) {
      const historyUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&hourly=cloud_cover,relative_humidity_2m,temperature_2m&daily=weather_code&start_date=${startOfMonth}&end_date=${todayStr}&timezone=auto`;
      const res = await fetch(historyUrl);
      const data = await res.json();
      if (data.daily && data.daily.time) {
        for (let i = 0; i < data.daily.time.length; i++) {
          const date = data.daily.time[i];
          const code = data.daily.weather_code[i];
          weatherCache[date] = { code, avgCloud: 0, avgHumidity: 0, nightTemp: null };
        }
      }
      if (data.hourly && data.hourly.time) {
        const clouds = data.hourly.cloud_cover;
        const humidity = data.hourly.relative_humidity_2m || [];
        const temps = data.hourly.temperature_2m || [];
        const dailyClouds = {};
        const dailyHumidity = {};
        const nightlyTemps = {};
        data.hourly.time.forEach((t, i) => {
          const hour = parseInt(t.split('T')[1].split(':')[0]);
          const day = t.split('T')[0];
          if (hour >= 20 || hour < 6) {
            if (!nightlyTemps[day]) nightlyTemps[day] = [];
            if (temps[i] !== undefined) nightlyTemps[day].push(temps[i]);
          }
          if (!dailyClouds[day]) { dailyClouds[day] = []; dailyHumidity[day] = []; }
          if (clouds[i] !== undefined) dailyClouds[day].push(clouds[i]);
          if (humidity[i] !== undefined) dailyHumidity[day].push(humidity[i]);
        });
        Object.keys(dailyClouds).forEach(day => {
          if (weatherCache[day]) {
            if (dailyClouds[day].length) weatherCache[day].avgCloud = dailyClouds[day].reduce((a, b) => a + b, 0) / dailyClouds[day].length;
            if (dailyHumidity[day].length) weatherCache[day].avgHumidity = dailyHumidity[day].reduce((a, b) => a + b, 0) / dailyHumidity[day].length;
            if (nightlyTemps[day] && nightlyTemps[day].length) {
              weatherCache[day].nightTemp = nightlyTemps[day].reduce((a, b) => a + b, 0) / nightlyTemps[day].length;
            }
          }
        });
      }
    }
    
    const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloud_cover,relative_humidity_2m,temperature_2m&daily=weather_code&start_date=${startDate}&timezone=auto&forecast_days=16`;
    const res2 = await fetch(forecastUrl);
    const data2 = await res2.json();
    if (data2.daily && data2.daily.time) {
      for (let i = 0; i < data2.daily.time.length; i++) {
        const date = data2.daily.time[i];
        const code = data2.daily.weather_code[i];
        weatherCache[date] = { code, avgCloud: 0, avgHumidity: 0, nightTemp: null };
      }
    }
    if (data2.hourly && data2.hourly.time) {
      const clouds = data2.hourly.cloud_cover;
      const humidity = data2.hourly.relative_humidity_2m || [];
      const temps = data2.hourly.temperature_2m || [];
      const dailyClouds = {};
      const dailyHumidity = {};
      const nightlyTemps = {};
      data2.hourly.time.forEach((t, i) => {
        const hour = parseInt(t.split('T')[1].split(':')[0]);
        const day = t.split('T')[0];
        if (hour >= 20 || hour < 6) {
          if (!nightlyTemps[day]) nightlyTemps[day] = [];
          if (temps[i] !== undefined) nightlyTemps[day].push(temps[i]);
        }
        if (!dailyClouds[day]) { dailyClouds[day] = []; dailyHumidity[day] = []; }
        if (clouds[i] !== undefined) dailyClouds[day].push(clouds[i]);
        if (humidity[i] !== undefined) dailyHumidity[day].push(humidity[i]);
      });
      Object.keys(dailyClouds).forEach(day => {
        if (weatherCache[day]) {
          if (dailyClouds[day].length) weatherCache[day].avgCloud = dailyClouds[day].reduce((a, b) => a + b, 0) / dailyClouds[day].length;
          if (dailyHumidity[day].length) weatherCache[day].avgHumidity = dailyHumidity[day].reduce((a, b) => a + b, 0) / dailyHumidity[day].length;
          if (nightlyTemps[day] && nightlyTemps[day].length) {
            weatherCache[day].nightTemp = nightlyTemps[day].reduce((a, b) => a + b, 0) / nightlyTemps[day].length;
          }
        }
      });
    }
  } catch (e) {
    console.error('Weather fetch failed:', e);
  }
}

function getWeatherEmoji(code, avgCloud) {
  if (avgCloud < 20) return '☀️';
  if (avgCloud < 50) return '⛅';
  if (avgCloud < 80) return '☁️';
  if (code >= 95) return '⛈️';
  if (code >= 80) return '🌧️';
  if (code >= 71) return '🌨️';
  if (code >= 61) return '🌧️';
  if (code >= 51) return '🌨️';
  if (code >= 45) return '🌫️';
  return '☁️';
}

async function renderImagingCalendar(metadataList) {
  currentCalendarMonth = new Date().getMonth();
  currentCalendarYear = new Date().getFullYear();
  currentMetadataList = metadataList;
  imagingData = [];
  metadataList.forEach(item => {
    if (item['Start Time UTC'] && item['Start Time UTC'] !== 'Unknown' && item['Target']) {
      const datePart = item['Start Time UTC'].split(' ')[0];
      const target = item['Target'];
      const totalExp = Number(item['Total Exposure Time s'] || 0);
      if (datePart && totalExp > 0) {
        imagingData.push({ date: datePart, target, totalExp });
      }
    }
  });

  await fetchSiteLocation(metadataList);
  await fetchWeatherForecast();
  initTempToggle();

  const calendarGrid = document.getElementById('calendar');
  if (!calendarGrid) return;

  if (!calendarListenersAdded) {
    document.getElementById('prevMonth').addEventListener('click', async () => {
      currentCalendarMonth--;
      if (currentCalendarMonth < 0) { currentCalendarMonth = 11; currentCalendarYear--; }
      await fetchWeatherForecast();
      renderCalendar();
    });
    document.getElementById('nextMonth').addEventListener('click', async () => {
      currentCalendarMonth++;
      if (currentCalendarMonth > 11) { currentCalendarMonth = 0; currentCalendarYear++; }
      await fetchWeatherForecast();
      renderCalendar();
    });
    calendarListenersAdded = true;
  }

  renderCalendar();
}

function getMoonPhase(date) {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53058867;
  const diffDays = (date - knownNewMoon) / (1000 * 60 * 60 * 24);
  const daysSinceNewMoon = diffDays % lunarCycle;
  const normalized = daysSinceNewMoon < 0 ? daysSinceNewMoon + lunarCycle : daysSinceNewMoon;
  const phase = Math.floor((normalized / lunarCycle) * 8) % 8;
  const phases = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  return phases[phase];
}

function renderCalendar(filtered = false) {
  const year = currentCalendarYear;
  const month = currentCalendarMonth;
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  document.getElementById('monthYear').textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const filteredImagingData = currentCatalogFilter ? imagingData.filter(item => {
    const name = item.target.toUpperCase().trim();
    const cleanName = name.replace(/MOSAIC/g, "").replace(/PANEL/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
    switch (currentCatalogFilter) {
      case 'Messier': return cleanName.startsWith("M ");
      case 'NGC': return cleanName.startsWith("NGC");
      case 'IC': return cleanName.startsWith("IC");
      case 'Caldwell': return cleanName.startsWith("CALDWELL");
      case 'Sharpless': return cleanName.startsWith("SH") || cleanName.startsWith("SH2");
      case 'Barnard': return cleanName.startsWith("BARNARD") || cleanName.startsWith("B ");
      case 'LDN': return cleanName.startsWith("LDN");
      case 'LBN': return cleanName.startsWith("LBN");
      case 'Abell': return cleanName.startsWith("ABELL");
      case 'PGC': return cleanName.startsWith("PGC");
      case 'UGC': return cleanName.startsWith("UGC");
      case 'Other': return !cleanName.startsWith("M ") && !cleanName.startsWith("NGC") && !cleanName.startsWith("IC") && !cleanName.startsWith("CALDWELL") && !cleanName.startsWith("SH") && !cleanName.startsWith("SH2") && !cleanName.startsWith("BARNARD") && !cleanName.startsWith("B ") && !cleanName.startsWith("LDN") && !cleanName.startsWith("LBN") && !cleanName.startsWith("ABELL") && !cleanName.startsWith("PGC") && !cleanName.startsWith("UGC");
      default: return true;
    }
  }) : imagingData;

  const hasFilteredDates = new Set();
  const sessionsByDate = {};
  filteredImagingData.forEach(item => {
    const itemDate = new Date(item.date);
    if (itemDate.getFullYear() === year && itemDate.getMonth() === month) {
      const key = `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}-${String(itemDate.getDate()).padStart(2, '0')}`;
      hasFilteredDates.add(key);
      if (!sessionsByDate[key]) sessionsByDate[key] = {};
      const targetKey = item.target;
      if (!sessionsByDate[key][targetKey]) sessionsByDate[key][targetKey] = 0;
      sessionsByDate[key][targetKey] += item.totalExp;
    }
  });

  let html = '';
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(d => {
    html += `<div class="day-header">${d}</div>`;
  });

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const prevMonthDate = new Date(year, month, day);
    const moonPhase = getMoonPhase(prevMonthDate);
    html += `<div class="day other-month"><div class="day-number">${day} ${moonPhase}</div></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const sessions = sessionsByDate[dateStr] || {};
    let sessionHtml = '';
    Object.entries(sessions).forEach(([target, totalSec]) => {
      const mins = Math.round(totalSec / 60);
      sessionHtml += `<div class="session" data-target="${target}" data-date="${dateStr}">${target} - ${mins}min</div>`;
    });
    const dayClass = hasFilteredDates.has(dateStr) ? 'day has-filtered' : 'day';
    const moonPhase = getMoonPhase(new Date(dateStr));
    const hasSession = hasFilteredDates.has(dateStr);
    const weatherInfo = weatherCache[dateStr];
    let weatherDetails = '';
    if (hasSession && weatherInfo) {
      const weatherEmoji = getWeatherEmoji(weatherInfo.code, weatherInfo.avgCloud);
      let tempHumidity = '';
      const temps = [];
      if (weatherInfo.nightTemp !== null) {
        const temp = useCelsius ? Math.round(weatherInfo.nightTemp) : Math.round(weatherInfo.nightTemp * 9/5 + 32);
        const unit = useCelsius ? 'C' : 'F';
        temps.push(`🌡${temp}°${unit}`);
      }
      if (weatherInfo.avgHumidity > 0) {
        temps.push(`°${Math.round(weatherInfo.avgHumidity)}%`);
      }
      if (temps.length > 0) {
        tempHumidity = ` (${temps.join('|')})`;
      }
      if (weatherEmoji || tempHumidity) {
        weatherDetails = `|${weatherEmoji}${tempHumidity}`;
      }
    }
    html += `<div class="${dayClass}"><div class="day-number">${day} ${moonPhase}${weatherDetails}</div>${sessionHtml}</div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = 7 - (totalCells % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      const nextMonthDate = new Date(year, month + 1, i);
      const moonPhase = getMoonPhase(nextMonthDate);
      html += `<div class="day other-month"><div class="day-number">${i} ${moonPhase}</div></div>`;
    }
  }

  document.getElementById('calendar').innerHTML = html;

  document.querySelectorAll('.session').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target.dataset.target;
      const date = e.target.dataset.date;
      detailsArea.innerHTML = '<p>Loading...</p>';
      requestAnimationFrame(() => {
        setTimeout(() => {
          const targetItems = currentMetadataList.filter(item => {
            const itemDate = item['Start Time UTC']?.split(' ')[0];
            return item['Target'] === target && itemDate === date;
          });
          detailsArea.innerHTML = createTableHTML(targetItems, [
            'Frame Type', 'File', 'Target', 'Start Time UTC', 'End Time UTC', 'Exposure Time s', 'Number of Subs', 'Total Exposure Time s',
            'Telescope', 'Camera Model', 'Sensor Temperature C', 'RA', 'DEC',
            'Latitude', 'Longitude', 'Binning', 'Filter Used', 'Gain',
            'Focal Length mm', 'Aperture mm', 'Focus Position', 'Image Type', 'Stacking Software'
          ]);
        }, 0);
      });
    });
  });
}





