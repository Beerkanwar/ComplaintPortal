'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  currentPanel: 'register',
  allComplaints: [],
  lastClassification: null,
  modelMode: 'real',
  modelEndpoint: 'http://localhost:8000/predict',
};

// Cache of previously classified text → result (for Re-classify stability testing)
let lastComplaintText = '';

// ─── DOM Helpers ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $$(id) && ($$(id).classList.remove('d-none'));
const hide = id => $$(id) && ($$(id).classList.add('d-none'));
const $$ = id => document.getElementById(id);

// ─── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupCharCounter();
  loadServerConfig();
  checkModelStatus();
  loadComplaints();
});

// ─── Character Counter ────────────────────────────────────────────────────────
function setupCharCounter() {
  const ta = $('complaint-input');
  ta.addEventListener('input', () => {
    $('char-count').textContent = ta.value.length;
  });
}

// ─── Panel Navigation ─────────────────────────────────────────────────────────
function showPanel(panel) {
  ['register', 'complaints', 'settings'].forEach(p => {
    const el = $(`panel-${p}`);
    if (el) el.classList.toggle('d-none', p !== panel);

    // Sync sidebar item active state
    const nav = $(`nav-${p}`);
    if (nav) nav.classList.toggle('active', p === panel);
  });

  state.currentPanel = panel;

  if (panel === 'complaints') loadComplaints();
  if (panel === 'settings') loadServerConfig();

  return false;
}

// Sync sidebar active highlight when clicked directly
function setSidebarActive(clickedEl) {
  document.querySelectorAll('.sidebar-item').forEach(el => el.classList.remove('active'));
  if (clickedEl) clickedEl.classList.add('active');
}

// Sync top navbar active highlight
function setActiveNav(clickedEl) {
  document.querySelectorAll('.nav-link-item').forEach(el => el.classList.remove('active'));
  if (clickedEl) clickedEl.classList.add('active');
}

// ─── Load Server Config ───────────────────────────────────────────────────────
async function loadServerConfig() {
  try {
    const res = await fetch('/config');
    const data = await res.json();
    state.modelMode = data.modelMode;
    state.modelEndpoint = data.modelEndpoint;

    $('setting-endpoint').value = data.modelEndpoint;
    selectMode(data.modelMode, false); // update UI without saving
  } catch (e) {
    console.warn('Could not load server config:', e.message);
  }
}

// ─── Model Status Check ───────────────────────────────────────────────────────
async function checkModelStatus() {
  const dot = $('status-dot');
  const label = $('status-label');

  dot.className = 'bi bi-circle-fill status-dot-nav checking';
  label.textContent = 'Checking model…';

  try {
    const res = await fetch('/health');
    const data = await res.json();

    if (data.modelMode === 'dummy') {
      dot.className = 'bi bi-circle-fill status-dot-nav dummy';
      label.textContent = 'Dummy mode (rules-based)';
    } else {
      // Ping the real model via a test classify
      try {
        const pingRes = await fetch('/classify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'test complaint ping' }),
        });
        const pingData = await pingRes.json();

        if (pingData.fallback) {
          dot.className = 'bi bi-circle-fill status-dot-nav dummy';
          label.textContent = 'Fallback (ML offline)';
        } else if (pingData.model_used === 'real') {
          dot.className = 'bi bi-circle-fill status-dot-nav online';
          label.textContent = 'ML model online ✓';
        } else {
          dot.className = 'bi bi-circle-fill status-dot-nav dummy';
          label.textContent = 'Fallback mode';
        }
      } catch {
        dot.className = 'bi bi-circle-fill status-dot-nav offline';
        label.textContent = 'Model unreachable';
      }
    }
  } catch {
    dot.className = 'bi bi-circle-fill status-dot-nav offline';
    label.textContent = 'Server error';
  }
}

// ─── CLASSIFY ─────────────────────────────────────────────────────────────────
async function classifyComplaint() {
  const text = $('complaint-input').value.trim();

  if (!text || text.length < 5) {
    showToast('Please enter a complaint of at least 5 characters.', 'warning');
    return;
  }

  lastComplaintText = text;
  setClassifyLoading(true);
  hideResult();

  try {
    const response = await fetch('/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Classification failed.');
    }

    state.lastClassification = data;
    populateForm(data);
    showResult(data);
    showToast('Complaint classified successfully!', 'success');

  } catch (err) {
    showToast(`Error: ${err.message}`, 'danger');
    console.error('[classify]', err);
  } finally {
    setClassifyLoading(false);
  }
}

// ─── Re-classify ──────────────────────────────────────────────────────────────
async function reclassify() {
  if (!lastComplaintText) return;
  $('complaint-input').value = lastComplaintText;
  await classifyComplaint();
}

// ─── Populate form from model response ───────────────────────────────────────
function populateForm(data) {
  setSelectValue('field-type',     data.complaint_type || '');
  setSelectValue('field-location', data.location       || '');
  setSelectValue('field-priority', data.priority       || '');

  $('field-summary').value     = data.summary             || '';
  $('field-description').value = lastComplaintText        || '';

  // Confidence pill
  if (data.confidence !== null && data.confidence !== undefined) {
    const pct = Math.round(data.confidence * 100);
    $('meta-confidence').textContent = `${pct}%`;
    $('meta-confidence-pill').classList.remove('d-none');
  } else {
    $('meta-confidence-pill').classList.add('d-none');
  }

  // Model badge
  const modelName = data.model_used === 'real' ? 'Real ML Model' : 'Built-in Dummy';
  $('meta-model-name').textContent = modelName;

  // Fallback pill
  if (data.fallback) {
    $('fallback-pill').classList.remove('d-none');
  } else {
    $('fallback-pill').classList.add('d-none');
  }

  // Add color flash to filled fields
  ['field-type', 'field-location', 'field-priority', 'field-summary'].forEach(id => {
    const el = $(id);
    el.classList.add('field-flash');
    setTimeout(() => el.classList.remove('field-flash'), 600);
  });
}

// Helper: set <select> value, add option if not present
function setSelectValue(selectId, value) {
  const sel = $(selectId);
  if (!value) return;

  // Check if option exists
  let found = false;
  for (const opt of sel.options) {
    if (opt.value === value) { found = true; break; }
  }

  if (!found) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    sel.appendChild(opt);
  }

  sel.value = value;
}

// ─── Show / Hide result section ───────────────────────────────────────────────
function showResult(data) {
  $('classification-result').classList.remove('d-none');
  $('success-card').classList.add('d-none');
  $('classification-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideResult() {
  $('classification-result').classList.add('d-none');
  $('form-error').classList.add('d-none');
}

// ─── Loading state for Classify button ────────────────────────────────────────
function setClassifyLoading(loading) {
  const btn = $('btn-classify');
  const spinner = $('classify-spinner');
  btn.disabled = loading;
  spinner.classList.toggle('d-none', !loading);
  btn.querySelector('.bi-cpu') && (btn.querySelector('.bi-cpu').style.display = loading ? 'none' : '');
}

// ─── SUBMIT COMPLAINT ─────────────────────────────────────────────────────────
async function submitComplaint(event) {
  event.preventDefault();

  const complaint_type = $('field-type').value;
  const location       = $('field-location').value;
  const priority       = $('field-priority').value;
  const summary        = $('field-summary').value.trim();
  const complaint_text = $('field-description').value.trim();

  // Client-side validation
  if (!complaint_type || !location || !priority || !complaint_text) {
    $('form-error').textContent = 'Please fill in all required fields (Type, Location, Priority, Description).';
    $('form-error').classList.remove('d-none');
    return;
  }

  $('form-error').classList.add('d-none');
  setSubmitLoading(true);

  try {
    const response = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaint_text,
        complaint_type,
        location,
        priority,
        summary,
        confidence: state.lastClassification?.confidence ?? null,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Submission failed.');
    }

    // Show success
    $('success-id').textContent = `#${data.id}`;
    $('classification-result').classList.add('d-none');
    $('success-card').classList.remove('d-none');
    $('success-card').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Update badge
    state.allComplaints.unshift(data.complaint);
    updateComplaintsBadge();

    showToast(`Complaint #${data.id} submitted!`, 'success');

  } catch (err) {
    $('form-error').textContent = `Submission error: ${err.message}`;
    $('form-error').classList.remove('d-none');
    showToast(`Submission failed: ${err.message}`, 'danger');
  } finally {
    setSubmitLoading(false);
  }
}

function setSubmitLoading(loading) {
  const btn = $('btn-submit');
  const spinner = $('submit-spinner');
  btn.disabled = loading;
  spinner.classList.toggle('d-none', !loading);
}

// ─── Reset / Clear ────────────────────────────────────────────────────────────
function clearInput() {
  $('complaint-input').value = '';
  $('char-count').textContent = '0';
}

function resetForm() {
  clearInput();
  hideResult();
  $('success-card').classList.add('d-none');
  $('complaint-form').reset();
  state.lastClassification = null;
  lastComplaintText = '';
}

function registerAnother() {
  resetForm();
  $('complaint-input').focus();
}

// ─── LOAD COMPLAINTS ─────────────────────────────────────────────────────────
async function loadComplaints() {
  try {
    const res = await fetch('/complaints');
    state.allComplaints = await res.json();
    updateComplaintsBadge();
    if (state.currentPanel === 'complaints') renderComplaints();
  } catch (err) {
    console.warn('Could not load complaints:', err.message);
  }
}

function updateComplaintsBadge() {
  $('complaints-badge').textContent = state.allComplaints.length;
}

function renderComplaints() {
  const typeFilter     = $('filter-type').value;
  const priorityFilter = $('filter-priority').value;
  const searchFilter   = $('filter-search').value.toLowerCase();

  let list = state.allComplaints;

  if (typeFilter)     list = list.filter(c => c.complaint_type === typeFilter);
  if (priorityFilter) list = list.filter(c => c.priority === priorityFilter);
  if (searchFilter)   list = list.filter(c =>
    c.complaint_text?.toLowerCase().includes(searchFilter) ||
    c.summary?.toLowerCase().includes(searchFilter) ||
    c.location?.toLowerCase().includes(searchFilter)
  );

  const container = $('complaints-list');

  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="bi bi-inbox"></i>
        <p>No complaints match the current filters.</p>
      </div>`;
    return;
  }

  container.innerHTML = list.map(c => buildComplaintCard(c)).join('');
}

function buildComplaintCard(c) {
  const priorityClass = (c.priority || '').toLowerCase();
  const date = c.submitted_at
    ? new Date(c.submitted_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown date';

  const confidenceStr = c.confidence !== null && c.confidence !== undefined
    ? `<span><i class="bi bi-graph-up"></i> ${Math.round(c.confidence * 100)}% confidence</span>`
    : '';

  return `
    <div class="complaint-card" id="complaint-${c.id}">
      <div class="complaint-card-header">
        <span class="complaint-id">#${c.id}</span>
        <span class="complaint-type-badge">${escapeHtml(c.complaint_type)}</span>
        <span class="priority-badge ${priorityClass}">${escapeHtml(c.priority)}</span>
        <span class="status-badge">${escapeHtml(c.status)}</span>
      </div>
      <div class="complaint-summary">${escapeHtml(c.summary || c.complaint_text?.substring(0, 80) || '')}</div>
      <div class="complaint-meta-row">
        <span><i class="bi bi-geo-alt"></i>${escapeHtml(c.location)}</span>
        <span><i class="bi bi-clock"></i>${date}</span>
        ${confidenceStr}
      </div>
    </div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── SETTINGS PANEL ──────────────────────────────────────────────────────────
function selectMode(mode, save = false) {
  state.modelMode = mode;
  $('mode-card-real').classList.toggle('active', mode === 'real');
  $('mode-card-dummy').classList.toggle('active', mode === 'dummy');
  if (save) saveSettings();
}

async function saveSettings() {
  const endpoint = $('setting-endpoint').value.trim();

  if (!endpoint) {
    showToast('Please enter a valid endpoint URL.', 'warning');
    return;
  }

  try {
    const res = await fetch('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modelMode: state.modelMode,
        modelEndpoint: endpoint,
      }),
    });

    const data = await res.json();

    if (!data.success) throw new Error('Config update failed.');

    state.modelEndpoint = data.modelEndpoint;

    // Show saved flash
    $('settings-saved-msg').classList.remove('d-none');
    setTimeout(() => $('settings-saved-msg').classList.add('d-none'), 2500);

    showToast('Settings saved!', 'success');
    checkModelStatus(); // Re-check status
  } catch (err) {
    showToast(`Failed to save: ${err.message}`, 'danger');
  }
}

async function testModelPing() {
  const text = $('test-ping-text').value.trim();
  if (!text) { showToast('Enter a test complaint first.', 'warning'); return; }

  $('ping-spinner').classList.remove('d-none');
  $('ping-result').classList.add('d-none');

  try {
    const res = await fetch('/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    $('ping-result').textContent = JSON.stringify(data, null, 2);
    $('ping-result').classList.remove('d-none');
  } catch (err) {
    $('ping-result').textContent = `Error: ${err.message}`;
    $('ping-result').style.color = '#fca5a5';
    $('ping-result').classList.remove('d-none');
  } finally {
    $('ping-spinner').classList.add('d-none');
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const toastEl = $('toast-msg');
  const toastBody = $('toast-body');

  toastEl.className = 'toast align-items-center border-0 text-white';

  const colorMap = {
    success: 'bg-success',
    danger:  'bg-danger',
    warning: 'bg-warning text-dark',
    info:    'bg-primary',
  };

  toastEl.classList.add(colorMap[type] || 'bg-primary');
  toastBody.textContent = message;

  const toast = new bootstrap.Toast(toastEl, { delay: 3500 });
  toast.show();
}

// ─── Add field-flash style dynamically ────────────────────────────────────────
(function injectFlashStyle() {
  const style = document.createElement('style');
  style.textContent = `
    .field-flash {
      animation: fieldGlow 0.55s ease-out;
    }
    @keyframes fieldGlow {
      0%   { box-shadow: 0 0 0 3px rgba(26,58,110,0.35); border-color: #1a3a6e !important; }
      100% { box-shadow: none; }
    }
  `;
  document.head.appendChild(style);
})();
