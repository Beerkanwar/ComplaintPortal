const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  // Switch between "dummy" (built-in fallback) or "real" (external ML server)
  modelMode: process.env.MODEL_MODE || 'real',

  // Real ML model endpoint (FastAPI / Flask / any REST)
  modelEndpoint: process.env.MODEL_ENDPOINT || 'http://localhost:8000/predict',

  // Request timeout for ML model (ms)
  modelTimeout: 8000,
};

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── IN-MEMORY STORE ─────────────────────────────────────────────────────────
let complaints = [];
let nextId = 1;

// ─── DUMMY CLASSIFIER (Fallback when ML server is unavailable) ───────────────
function dummyClassify(text) {
  const lower = text.toLowerCase();

  const typeMap = [
    { keywords: ['electricity', 'power', 'fan', 'light', 'bulb', 'ac', 'air condition', 'switch', 'socket', 'wiring', 'short circuit', 'mcb'], type: 'Electricity' },
    { keywords: ['water', 'pipe', 'leakage', 'tap', 'drainage', 'sewage', 'flush', 'blockage', 'tank'], type: 'Water Supply' },
    { keywords: ['wifi', 'internet', 'network', 'connection', 'bandwidth', 'router', 'lan', 'ethernet'], type: 'IT / Network' },
    { keywords: ['hostel', 'room', 'window', 'door', 'lock', 'bed', 'mattress', 'furniture', 'warden'], type: 'Hostel' },
    { keywords: ['road', 'path', 'footpath', 'pothole', 'construction', 'building', 'wall', 'ceiling', 'roof'], type: 'Civil / Infrastructure' },
    { keywords: ['mess', 'food', 'canteen', 'meal', 'dining', 'kitchen', 'menu', 'quality'], type: 'Mess / Canteen' },
    { keywords: ['library', 'book', 'journal', 'reading', 'catalogue'], type: 'Library' },
    { keywords: ['transport', 'bus', 'vehicle', 'parking', 'driver'], type: 'Transport' },
  ];

  const priorityMap = [
    { keywords: ['urgent', 'emergency', 'immediately', 'danger', 'hazard', 'critical', 'fire', 'flood', 'safety'], level: 'High' },
    { keywords: ['not working', 'broken', 'damaged', 'failed', 'issue', 'problem', 'complaint'], level: 'Medium' },
  ];

  const locationMap = [
    { keywords: ['hostel a', 'block a', 'a block'], loc: 'Hostel A' },
    { keywords: ['hostel b', 'block b', 'b block'], loc: 'Hostel B' },
    { keywords: ['hostel c', 'block c', 'c block'], loc: 'Hostel C' },
    { keywords: ['hostel d', 'block d', 'd block'], loc: 'Hostel D' },
    { keywords: ['main building', 'admin', 'administrative', 'office'], loc: 'Main Building' },
    { keywords: ['library'], loc: 'Library' },
    { keywords: ['lab', 'laboratory', 'computer lab', 'workshop'], loc: 'Laboratory' },
    { keywords: ['canteen', 'mess', 'dining hall'], loc: 'Mess / Canteen' },
    { keywords: ['ground', 'sports', 'field', 'playground'], loc: 'Sports Ground' },
    { keywords: ['auditorium', 'seminar', 'hall'], loc: 'Auditorium' },
  ];

  // Determine type
  let complaint_type = 'General';
  for (const item of typeMap) {
    if (item.keywords.some(k => lower.includes(k))) {
      complaint_type = item.type;
      break;
    }
  }

  // Determine priority
  let priority = 'Low';
  for (const item of priorityMap) {
    if (item.keywords.some(k => lower.includes(k))) {
      priority = item.level;
      break;
    }
  }

  // Determine location
  let location = 'Campus (General)';
  for (const item of locationMap) {
    if (item.keywords.some(k => lower.includes(k))) {
      location = item.loc;
      break;
    }
  }

  // Simple summary: first 12 words
  const words = text.trim().split(/\s+/);
  const summary = words.slice(0, 12).join(' ') + (words.length > 12 ? '...' : '');

  return {
    complaint_type,
    location,
    priority,
    summary,
    confidence: +(0.55 + Math.random() * 0.25).toFixed(2),
    model_used: 'dummy',
  };
}

// ─── CALL REAL ML MODEL ───────────────────────────────────────────────────────
async function callMLModel(text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG.modelTimeout);

  try {
    const response = await fetch(CONFIG.modelEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`ML server responded with status ${response.status}`);
    }

    const data = await response.json();

    // Validate required fields
    const required = ['complaint_type', 'location', 'priority', 'summary'];
    for (const field of required) {
      if (!data[field]) {
        throw new Error(`ML model response missing field: ${field}`);
      }
    }

    return {
      ...data,
      confidence: data.confidence ?? null,
      model_used: 'real',
    };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', modelMode: CONFIG.modelMode, endpoint: CONFIG.modelEndpoint });
});

// Get current config (for frontend mode switcher)
app.get('/config', (req, res) => {
  res.json({
    modelMode: CONFIG.modelMode,
    modelEndpoint: CONFIG.modelEndpoint,
  });
});

// Switch model mode at runtime
app.post('/config', (req, res) => {
  const { modelMode, modelEndpoint } = req.body;

  if (modelMode && ['real', 'dummy'].includes(modelMode)) {
    CONFIG.modelMode = modelMode;
  }
  if (modelEndpoint && typeof modelEndpoint === 'string') {
    CONFIG.modelEndpoint = modelEndpoint;
  }

  res.json({
    success: true,
    modelMode: CONFIG.modelMode,
    modelEndpoint: CONFIG.modelEndpoint,
  });
});

// POST /classify — main classification endpoint
app.post('/classify', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length < 5) {
    return res.status(400).json({ error: 'Please provide a complaint text of at least 5 characters.' });
  }

  try {
    let result;

    if (CONFIG.modelMode === 'dummy') {
      result = dummyClassify(text.trim());
    } else {
      // Try real model, fall back to dummy on failure
      try {
        result = await callMLModel(text.trim());
      } catch (mlErr) {
        console.warn(`[ML] Real model failed: ${mlErr.message} — falling back to dummy`);
        result = dummyClassify(text.trim());
        result.fallback = true;
        result.fallback_reason = mlErr.message;
      }
    }

    return res.json(result);
  } catch (err) {
    console.error('[/classify] Unexpected error:', err);
    return res.status(500).json({ error: 'Classification failed. Please try again.' });
  }
});

// POST /submit — save complaint
app.post('/submit', (req, res) => {
  const { complaint_text, complaint_type, location, priority, summary, confidence } = req.body;

  if (!complaint_text || !complaint_type || !location || !priority) {
    return res.status(400).json({ error: 'Missing required complaint fields.' });
  }

  const complaint = {
    id: nextId++,
    complaint_text,
    complaint_type,
    location,
    priority,
    summary: summary || '',
    confidence: confidence ?? null,
    status: 'Pending',
    submitted_at: new Date().toISOString(),
  };

  complaints.push(complaint);
  console.log(`[/submit] Saved complaint #${complaint.id}: ${complaint_type} @ ${location}`);

  return res.status(201).json({ success: true, id: complaint.id, complaint });
});

// GET /complaints — list all complaints
app.get('/complaints', (req, res) => {
  // Return newest first
  return res.json([...complaints].reverse());
});

// DELETE /complaints/:id — (bonus utility)
app.delete('/complaints/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const index = complaints.findIndex(c => c.id === id);
  if (index === -1) return res.status(404).json({ error: 'Complaint not found.' });
  complaints.splice(index, 1);
  return res.json({ success: true });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 NITJ Complaint Portal running at http://localhost:${PORT}`);
  console.log(`📡 Model mode  : ${CONFIG.modelMode}`);
  console.log(`🔗 ML endpoint : ${CONFIG.modelEndpoint}\n`);
});
