const fs = require('fs');

function readCard(chunk) {
  const line = chunk.toString('ascii');
  const key = line.slice(0, 8).trim();
  const rest = line.slice(8).trim();
  let value = null;

  if (rest.startsWith('=')) {
    let valuePart = rest.slice(1);
    // Remove comment if present
    const commentIndex = valuePart.indexOf('/');
    if (commentIndex !== -1) {
      valuePart = valuePart.slice(0, commentIndex);
    }
    valuePart = valuePart.trim();

    // Parse different value types
    if (valuePart.startsWith("'") && valuePart.endsWith("'")) {
      // String value
      value = valuePart.slice(1, -1);
    } else if (valuePart === 'T') {
      value = true;
    } else if (valuePart === 'F') {
      value = false;
    } else if (!isNaN(valuePart) && valuePart !== '') {
      // Numeric value
      value = valuePart.includes('.') ? parseFloat(valuePart) : parseInt(valuePart);
    } else {
      // Keep as string for other cases
      value = valuePart;
    }
  }

  return { key, value };
}

function parseFitsHeader(filePath) {
  const fd = fs.openSync(filePath, 'r');
  const blockSize = 2880;
  let headerText = '';
  let offset = 0;

  while (true) {
    const buffer = Buffer.alloc(blockSize);
    const bytesRead = fs.readSync(fd, buffer, 0, blockSize, offset);
    if (bytesRead === 0) break;
    headerText += buffer.toString('ascii');
    offset += bytesRead;
    if (headerText.includes('END')) break;
  }

  fs.closeSync(fd);

  const header = {};
  for (let i = 0; i < headerText.length; i += 80) {
    const card = headerText.slice(i, i + 80);
    if (!card.trim()) continue;
    const { key, value } = readCard(Buffer.from(card, 'ascii'));
    if (key === 'END') break;
    if (key) {
      header[key] = value !== null ? value : header[key];
    }
  }
  return header;
}

module.exports = { parseFitsHeader };