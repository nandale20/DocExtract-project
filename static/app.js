
// ======================================================
// DocExtract AI - FINAL WORKING VERSION
// ======================================================

const $ = (s, r = document) => r.querySelector(s);

// ======================================================
// THEME
// ======================================================

const themeBtn = $('#themeBtn');

function applyTheme(theme) {

  document.documentElement.dataset.theme = theme;

  localStorage.setItem('theme', theme);

  if (themeBtn) {
    themeBtn.textContent =
      theme === 'dark' ? '☀️' : '🌙';
  }

}

applyTheme(
  localStorage.getItem('theme') ||
  (
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  )
);

themeBtn?.addEventListener('click', () => {

  applyTheme(
    document.documentElement.dataset.theme === 'dark'
      ? 'light'
      : 'dark'
  );

});

// ======================================================
// PDF.js SETUP
// ======================================================



// ======================================================
// DOM ELEMENTS
// ======================================================

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');

const chooseFileBtn = $('#chooseFileBtn');
const sampleBtn = $('#sampleBtn');

const progressCard = $('#progressCard');
const progressLabel = $('#progressLabel');
const progressBar = $('#progressBar');

const uploadSection = $('#upload');
const resultsSection = $('#results');

const textBox = $('#textBox');
const metaBox = $('#metaBox');

const chartsStack = $('#chartsStack');

const reUploadBtn = $('#reUploadBtn');
const downloadBtn = $('#downloadBtn');
const toggleChartsBtn = $('#toggleChartsBtn');

const successPop = $('#successPop');

const historyList = $('#historyList');
const refreshHistoryBtn = $('#refreshHistoryBtn');

let currentResult = null;
let chartInstances = [];

// ======================================================
// DRAG & DROP
// ======================================================

let fileDialogOpen = false;

// ---------------- DRAG EVENTS ----------------

['dragenter', 'dragover'].forEach(event => {

  dropzone?.addEventListener(event, e => {

    e.preventDefault();

    dropzone.classList.add('drag');

  });

});

['dragleave', 'drop'].forEach(event => {

  dropzone?.addEventListener(event, e => {

    e.preventDefault();

    dropzone.classList.remove('drag');

  });

});

// ---------------- DROP FILE ----------------

dropzone?.addEventListener('drop', e => {

  e.preventDefault();

  const file = e.dataTransfer.files[0];

  if (file) {

    handleFile(file);

  }

});

// ---------------- SAFE FILE PICKER ----------------

function openFilePicker(e) {

  if (e) {
    e.stopPropagation();
  }

  // Prevent double popup
  if (fileDialogOpen) {
    return;
  }

  fileDialogOpen = true;

  // Reset input so same file works again
  fileInput.value = '';

  fileInput.click();

  setTimeout(() => {

    fileDialogOpen = false;

  }, 500);

}

// Dropzone click
dropzone?.addEventListener('click', openFilePicker);

// Choose File button
chooseFileBtn?.addEventListener('click', openFilePicker);

// File selected
fileInput?.addEventListener('change', e => {

  const file = e.target.files[0];

  // User closed popup
  if (!file) {
    return;
  }

  handleFile(file);

});

// ---------------- SAMPLE ----------------

sampleBtn?.addEventListener('click', e => {

  e.stopPropagation();

  useSample();

});

// ---------------- OTHER BUTTONS ----------------

reUploadBtn?.addEventListener(
  'click',
  resetToUpload
);



// ======================================================
// PROGRESS
// ======================================================

function setProgress(percent, label = '') {

  if (progressBar) {
    progressBar.style.width = percent + '%';
  }

  if (progressLabel) {
    progressLabel.textContent = label;
  }

}

// ======================================================
// FILE HANDLING
// ======================================================

async function handleFile(file) {

  if (!file) return;

  console.log('Uploading:', file.name);

  const lower = file.name.toLowerCase();

  const allowed =
    lower.endsWith('.pdf') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg');

  if (!allowed) {

    alert('Only PDF, PNG, JPG and JPEG allowed');

    return;

  }

  uploadSection.classList.add('hidden');

  progressCard.classList.remove('hidden');

  resultsSection.classList.add('hidden');

  setProgress(5, 'Reading file...');

  try {

    let text = '';

    if (lower.endsWith('.pdf')) {

      text = await extractFromPdf(file);

    } else {

      text = await extractFromImage(file);

    }

    if (!text || !text.trim()) {

      text = '(No text detected)';

    }

    await finishExtraction(file, text);

  }

  catch (err) {

    console.error(err);

    alert('Extraction failed:\n' + err.message);

    resetToUpload();

  }

}

// ======================================================
// PDF EXTRACTION
// ======================================================

async function extractFromPdf(file) {

  setProgress(10, 'Loading PDF...');

  if (typeof pdfjsLib === 'undefined') {
    throw new Error('PDF.js library not loaded');
  }

  const arrayBuffer = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer
  }).promise;

  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {

    const page = await pdf.getPage(pageNum);

    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .map(item => item.str)
      .join(' ');

    fullText += pageText + '\n\n';

    setProgress(
      Math.round((pageNum / pdf.numPages) * 100),
      `Reading Page ${pageNum}/${pdf.numPages}`
    );
  }

  if (!fullText.trim()) {
    fullText = 'No readable text found in PDF';
  }

  return fullText;
}

// ======================================================
// IMAGE OCR
// ======================================================

async function extractFromImage(file) {

  setProgress(10, 'Running OCR...');

  const result = await Tesseract.recognize(
    file,
    'eng',
    {
      logger: msg => {

        if (msg.status === 'recognizing text') {

          setProgress(
            20 + Math.round(msg.progress * 75),
            'Recognizing text...'
          );

        }

      }
    }
  );

  setProgress(100, 'OCR Complete');

  return result.data.text || '';

}

// ======================================================
// FINISH EXTRACTION
// ======================================================

async function finishExtraction(file, text) {

  currentResult = {

    file_name: file.name,

    file_size: file.size,

    file_type: file.type || 'unknown',

    extracted_text: text,

    uploaded_at: new Date()

  };

  showResults();

  try {

    await fetch('/save_extraction', {

      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify(currentResult)

    });

    loadHistory();

  }

  catch (e) {

    console.warn('Save failed:', e);

  }

}

// ======================================================
// SHOW RESULTS
// ======================================================

function showResults() {

  progressCard.classList.add('hidden');

  resultsSection.classList.remove('hidden');

  successPop.classList.remove('hidden');

  setTimeout(() => {

    successPop.classList.add('hidden');

  }, 2000);

  const r = currentResult;

  metaBox.innerHTML = `
    <span><b>${escapeHtml(r.file_name)}</b></span>
    <span>${formatSize(r.file_size)}</span>
    <span>${r.uploaded_at.toLocaleString()}</span>
    <span>${r.extracted_text.length} characters</span>
  `;

  textBox.textContent =
    r.extracted_text || '(No text found)';

  buildCharts(r.extracted_text);

}

// ======================================================
// RESET
// ======================================================

function resetToUpload() {

  uploadSection.classList.remove('hidden');

  progressCard.classList.add('hidden');

  resultsSection.classList.add('hidden');

  fileInput.value = '';

  setProgress(0, '');

}

// ======================================================
// UTILITIES
// ======================================================

function escapeHtml(str) {

  return String(str).replace(
    /[&<>"']/g,
    m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m])
  );

}

function formatSize(bytes) {

  if (bytes < 1024) {
    return bytes + ' B';
  }

  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }

  return (bytes / 1024 / 1024).toFixed(2) + ' MB';

}

// ======================================================
// CHARTS
// ======================================================

function buildCharts(text) {

  chartsStack.innerHTML = '';

  const data = analyzeText(text);

  const labels = [
    'Names',
    'Emails',
    'Phones',
    'Money',
    'Dates'
  ];

  const values = [

    data.names.length,
    data.emails.length,
    data.phones.length,
    data.money.length,
    data.dates.length

  ];

  const canvas =
    document.createElement('canvas');

  chartsStack.appendChild(canvas);

  new Chart(canvas, {

    type: 'bar',

    data: {

      labels,

      datasets: [{

        label: 'Detected Data',

        data: values,

        borderRadius: 8

      }]

    },

    options: {

      responsive: true,

      scales: {

        y: {
          beginAtZero: true
        }

      }

    }

  });

}
// ======================================================
// TOGGLE CHARTS
// ======================================================

toggleChartsBtn?.addEventListener('click', () => {

  chartsStack.classList.toggle('hidden');

});

// ======================================================
// ======================================================
// TEXT ANALYSIS
// ======================================================

function analyzeText(text) {

  // Emails
  const emails =
    text.match(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}/g
    ) || [];

  // Phone Numbers
  const phones =
    text.match(
      /\b\d{10}\b/g
    ) || [];

  // Money Values
  const money =
    text.match(
      /₹?\s?\d+(?:,\d+)*(?:\.\d+)?/g
    ) || [];

  // Names (simple capitalized words)
  const names =
    text.match(
      /\b[A-Z][a-z]+\b/g
    ) || [];

  return {

    names,

    phones,

    emails,

    money,

    counts: {

      names: names.length,

      phones: phones.length,

      emails: emails.length,

      money: money.length

    }

  };

}

// ======================================================
// DOWNLOAD PDF
// ======================================================

downloadBtn?.addEventListener('click', async () => {

  try {

    if (!currentResult) {

      alert('No data available');

      return;

    }

    // Analyze extracted text
    const analyzed =
      analyzeText(currentResult.extracted_text);

    const response = await fetch('/download', {

      method: 'POST',

      headers: {
        'Content-Type': 'application/json'
      },

      body: JSON.stringify({

        text: currentResult.extracted_text,

        analysis: analyzed

      })

    });

    if (!response.ok) {

      throw new Error('Failed to generate PDF');

    }

    const blob = await response.blob();

    const url =
      window.URL.createObjectURL(blob);

    const a =
      document.createElement('a');

    a.href = url;

    a.download = 'report.pdf';

    document.body.appendChild(a);

    a.click();

    a.remove();

    window.URL.revokeObjectURL(url);

  }

  catch (err) {

    console.error(err);

    alert('PDF download failed');

  }

});
// ======================================================
// HISTORY
// ======================================================

// ======================================================
// LOAD HISTORY
// ======================================================

async function loadHistory() {

  try {

    const res =
      await fetch('/list_extractions');

    if (!res.ok) {

      throw new Error(
        'History load failed'
      );

    }

    const rows = await res.json();

    historyList.innerHTML = '';

    if (!rows.length) {

      historyList.innerHTML =
        '<li class="empty">No history found</li>';

      return;

    }

    rows.forEach(r => {

      const li =
        document.createElement('li');

      li.className = 'history-item';

      li.innerHTML = `

        <div class="name">
          ${escapeHtml(r.file_name)}
        </div>

        <div class="sub">

          ${formatSize(r.file_size)}
          •
          ${new Date(
            r.created_at
          ).toLocaleString()}

        </div>

      `;

      historyList.appendChild(li);

    });

  }

  catch (err) {

    console.error(err);

    historyList.innerHTML = `
      <li class="empty">
        Failed to load history
      </li>
    `;

  }

}
//
//
// ======================================================
// SAMPLE
// ======================================================

function useSample() {

  const sample = `
Sales : 1200
Profit : 500
Loss : 100
Tax : 18
`;

  currentResult = {

    file_name: 'sample.txt',

    file_size: sample.length,

    file_type: 'text/plain',

    extracted_text: sample,

    uploaded_at: new Date()

  };

  showResults();

}

//data extraction

function analyzeText(text) {

  const emails =
    text.match(
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
    ) || [];

  const phones =
    text.match(
      /(\+?\d[\d\s\-]{8,}\d)/g
    ) || [];

  const money =
    text.match(
      /(?:₹|\$|Rs\.?)\s?\d+(?:,\d+)*(?:\.\d+)?/g
    ) || [];

  const dates =
    text.match(
      /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g
    ) || [];

  // Simple name detection
   const names =
  
  text.match(
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g
  ) || [];

  return {

    names,
    emails,
    phones,
    money,
    dates

  };

}

// ======================================================
// INIT
// ======================================================

loadHistory();