
const $ = (s, r = document) => r.querySelector(s);

// ================= THEME =================

const themeBtn = $('#themeBtn');

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);

  if (themeBtn) {
    themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }
}

applyTheme(
  localStorage.getItem('theme') ||
  (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
);

themeBtn?.addEventListener('click', () => {
  applyTheme(
    document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
  );
});

// ================= GLOBAL STATE =================

let currentResult = null;

// ================= HISTORY (FIXED - SINGLE VERSION) =================

async function loadHistory() {
  try {
    const res = await fetch("/list_extractions");
    const data = await res.json();

    const list = document.getElementById("historyList");
    if (!list) return;

    list.innerHTML = "";

    if (!data || data.length === 0) {
      list.innerHTML = "<li>No history found</li>";
      return;
    }

    data.forEach(row => {
      const li = document.createElement("li");

      li.innerHTML = `
        <div style="padding:8px;border-bottom:1px solid #333">
          <b>${row.file_name}</b><br>
          Type: ${row.file_type} | Size: ${row.file_size} bytes<br>
          Characters: ${row.char_count}<br>
          <small>${row.created_at}</small>
        </div>
      `;

      list.appendChild(li);
    });

  } catch (err) {
    console.log("History error:", err);
  }
}

// ================= FIXED WINDOW LOAD (ONLY ONE) =================

window.addEventListener("load", () => {
  loadHistory();
});

// ================= SAFE SAVE (NO BROKEN ENDPOINT) =================

async function saveToDB(payload) {
  try {
    await fetch("/upload", {
      method: "POST",
      body: payload
    });

    loadHistory();

  } catch (e) {
    console.warn("Save failed", e);
  }
}

// ================= DOWNLOAD (FIXED SAFE) =================

function downloadPDF(text, analysis) {
  fetch("/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text, analysis })
  })
    .then(res => {
      if (!res.ok) throw new Error("Download failed");
      return res.blob();
    })
    .then(blob => {
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = "report.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
    })
    .catch(console.error);
}

// ================= ANALYSIS (MERGED - SINGLE VERSION ONLY) =================

function analyzeText(text) {

  const emails = text.match(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
  ) || [];

  const phones = text.match(
    /(\+?\d[\d\s\-]{8,}\d)/g
  ) || [];

  const money = text.match(
    /(?:₹|\$|Rs\.?)\s?\d+(?:,\d+)*(?:\.\d+)?/g
  ) || [];

  const dates = text.match(
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g
  ) || [];

  const names = text.match(
    /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g
  ) || [];

  return {
    emails,
    phones,
    money,
    dates,
    names
  };
}

// ================= SAMPLE =================

function useSample() {

  const sample = `
Sales : 1200
Profit : 500
Loss : 100
Tax : 18
`;

  currentResult = {
    file_name: "sample.txt",
    file_size: sample.length,
    file_type: "text/plain",
    extracted_text: sample,
    uploaded_at: new Date()
  };

  showResults();
}
