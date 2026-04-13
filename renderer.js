const selectBtn = document.getElementById('selectDir');
const scanBtn = document.getElementById('scanBtn');
const stopBtn = document.getElementById('stopBtn');
const organizeBtn = document.getElementById('organizeBtn');
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
    progressBar.value = (progress.current / progress.total) * 100;
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
detailsArea.innerHTML = createTableHTML(result.metadataList, [
    'File', 'Target', 'Start Time UTC', 'End Time UTC', 'Exposure Time s', 'Number of Subs', 'Total Exposure Time s',
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
document.getElementById('removejpgBtn').addEventListener('click', async () => {
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
document.getElementById('sirilprepBtn').addEventListener('click', async () => {
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
  const { deletedCount, totalFolders } = data;

  progressBar.max = totalFolders;
  progressBar.value = deletedCount;
  progressText.textContent = `Removed ${deletedCount} of ${totalFolders} empty folders...`;
});

// Remove empty folders handler
document.getElementById('removeemptyBtn').addEventListener('click', async () => {
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
    Other: 0
  };

  summaryGroups.forEach(group => {
    const name = (group.Target || "").toUpperCase();

    if (name.startsWith("M ")) catalogCounts.Messier++;
    else if (name.startsWith("NGC")) catalogCounts.NGC++;
    else if (name.startsWith("IC")) catalogCounts.IC++;
    else if (name.startsWith("CALDWELL")) catalogCounts.Caldwell++;
    else if (name.startsWith("SH") || name.startsWith("SH2")) catalogCounts.Sharpless++;
    else if (name.startsWith("BARNARD") || name.startsWith("B ")) catalogCounts.Barnard++;
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



