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
renderCatalogBreakdown(result.targetSummary);
renderCalibrationSummary(result.calibrationSummary);
renderImagingCalendar(result.metadataList);
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
  const th = columns.map((c) => `<th>${c}</th>`).join('');
  const rows = data.map((row) => {
    const cells = columns.map((col) => `<td>${row[col] ?? ''}</td>`).join('');
    return `<tr>${cells}</tr>`;
  }).join('');
  return `<table><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
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
      <tr>
        <td>${catalog}</td>
        <td>${count}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";

  catalogDiv.innerHTML = html;
}

let imagingData = [];
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();
let calendarListenersAdded = false;

function renderImagingCalendar(metadataList) {
  currentCalendarMonth = new Date().getMonth();
  currentCalendarYear = new Date().getFullYear();
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

  const calendarGrid = document.getElementById('calendar');
  if (!calendarGrid) return;

  if (!calendarListenersAdded) {
    document.getElementById('prevMonth').addEventListener('click', () => {
      currentCalendarMonth--;
      if (currentCalendarMonth < 0) { currentCalendarMonth = 11; currentCalendarYear--; }
      renderCalendar();
    });
    document.getElementById('nextMonth').addEventListener('click', () => {
      currentCalendarMonth++;
      if (currentCalendarMonth > 11) { currentCalendarMonth = 0; currentCalendarYear++; }
      renderCalendar();
    });
    calendarListenersAdded = true;
  }

  renderCalendar();
}

function renderCalendar() {
  const year = currentCalendarYear;
  const month = currentCalendarMonth;
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  document.getElementById('monthYear').textContent = `${monthNames[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const sessionsByDate = {};
  imagingData.forEach(item => {
    const itemDate = new Date(item.date);
    if (itemDate.getFullYear() === year && itemDate.getMonth() === month) {
      const key = itemDate.toISOString().split('T')[0];
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
    html += `<div class="day other-month"><div class="day-number">${day}</div></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const sessions = sessionsByDate[dateStr] || {};
    let sessionHtml = '';
    Object.entries(sessions).forEach(([target, totalSec]) => {
      const mins = Math.round(totalSec / 60);
      sessionHtml += `<div class="session">${target} - ${mins}min</div>`;
    });
    html += `<div class="day"><div class="day-number">${day}</div>${sessionHtml}</div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const remaining = 7 - (totalCells % 7);
  if (remaining < 7) {
    for (let i = 1; i <= remaining; i++) {
      html += `<div class="day other-month"><div class="day-number">${i}</div></div>`;
    }
  }

  document.getElementById('calendar').innerHTML = html;
}





