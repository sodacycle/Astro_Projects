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

scanBtn.addEventListener('click', async () => {
  if (!selectedDirectory) {
    status.textContent = 'Please select a directory first.';
    return;
  }

  // Clear previous results
  summaryArea.innerHTML = '';
  detailsArea.innerHTML = '';

  status.textContent = 'Scanning FITS files...';
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

  summaryArea.innerHTML = createTableHTML(result.targetSummary, ['Target', 'FITS Count', 'Files With Exposure', 'Summed Integration Time s']);
  detailsArea.innerHTML = createTableHTML(result.metadataList, [
    'File', 'Target', 'Start Time UTC', 'End Time UTC', 'Exposure Time s', 'Number of Subs', 'Total Exposure Time s',
    'Telescope', 'Camera Model', 'Sensor Temperature C', 'RA', 'DEC',
    'Latitude', 'Longitude', 'Binning', 'Filter Used', 'Gain',
    'Focal Length mm', 'Aperture mm', 'Focus Position', 'Image Type', 'Stacking Software'
  ]);

  organizeBtn.disabled = false;
  removejpgBtn.disabled = false;
});

stopBtn.addEventListener('click', async () => {
  await window.electronAPI.cancelAll();
  status.textContent = 'Cancel requested; waiting for operation to stop...';
  stopBtn.disabled = true;
});


organizeBtn.addEventListener('click', async () => {
  if (!selectedDirectory) {
    status.textContent = 'Please select a directory first.';
    return;
  }

  organizeBtn.disabled = true;
  status.textContent = 'Organizing stacked files...';

  const result = await window.electronAPI.organizeStacked(selectedDirectory);

  if (result.error) {
    status.textContent = `Error: ${result.error}`;
  } else {
    status.textContent = `${result.message}`;
  }

  organizeBtn.disabled = false;
});

//document.getElementById('removejpgBtn').addEventListener('click', async () => {
//  const dir = await window.electronAPI.selectDirectory();
//  if (!dir) return;

//  const result = await window.electronAPI.removeJpg(dir);

 // if (result.error) {
 //   alert(`Error: ${result.error}`);
//    return;
 // }

 // alert(`Deleted ${result.deletedCount} JPG/JPEG files.`);
//});

document.getElementById('removejpgBtn').addEventListener('click', async () => {
  if (!selectedDirectory) {
    alert("Please select a directory first.");
    return;
  }

  // Show progress bar
  progressContainer.style.display = 'block';
  progressBar.value = 0;
  progressText.textContent = "Starting JPG removal...";
  stopBtn.disabled = false;

  // Listen for progress events
  window.electronAPI.onRemoveProgress((event, data) => {
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

  alert(`Deleted ${result.deletedCount} JPG/JPEG files.`);
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
