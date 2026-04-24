# NITJ Complaint Classification System

> **Dr B R Ambedkar National Institute of Technology Jalandhar**  
> ML-Powered Complaint Management Portal

---

## 🗂 Project Structure

```
ComplaintPortal/
├── server.js          ← Node.js Express backend (middleware + API)
├── package.json
├── model_server.py    ← Python FastAPI ML server (plug your model here)
├── public/
│   ├── index.html     ← Portal UI
│   ├── style.css      ← Dark NITJ-themed styles
│   └── script.js      ← Frontend logic (classify → form → submit)
└── README.md
```

---

## 🚀 How to Run

### 1. Start the Node.js backend

```bash
cd ComplaintPortal
npm install
node server.js
# → http://localhost:3000
```

### 2. Start the Python ML Model Server

```bash
pip install fastapi uvicorn
python3 model_server.py
# → http://localhost:8000
```

### 3. Open the Portal

Navigate to **http://localhost:3000** in your browser.

---

## 🔄 Flow

```
User types complaint
    ↓
Frontend → POST /classify (Node.js)
    ↓
Node.js  → POST http://localhost:8000/predict (FastAPI ML server)
    ↓
ML model → returns { complaint_type, location, priority, summary, confidence }
    ↓
Node.js  → returns to frontend
    ↓
Form auto-filled, user reviews & submits
    ↓
Frontend → POST /submit (Node.js)  → stored in memory
```

---

## 🧠 Plugging in Your Real Model

Open `model_server.py` and replace the `rule_based_classify()` function:

```python
# Example: scikit-learn
import joblib
model = joblib.load("complaint_classifier.pkl")

@app.post("/predict")
def predict(req: PredictRequest):
    label = model.predict([req.text])[0]
    proba = float(model.predict_proba([req.text]).max())
    return PredictResponse(
        complaint_type=label,
        location="Campus (General)",
        priority="Medium",
        summary=req.text[:80],
        confidence=proba,
    )
```

---

## ⚙️ Switching Model Mode (at runtime)

Go to **Settings** panel in the UI or call:

```bash
# Use built-in dummy (no ML server needed)
curl -X POST http://localhost:3000/config \
  -H "Content-Type: application/json" \
  -d '{"modelMode": "dummy"}'

# Use real ML server
curl -X POST http://localhost:3000/config \
  -H "Content-Type: application/json" \
  -d '{"modelMode": "real", "modelEndpoint": "http://localhost:8000/predict"}'
```

---

## 📡 API Reference

| Method | Endpoint        | Description                          |
|--------|----------------|--------------------------------------|
| POST   | `/classify`     | Classify a complaint text via ML     |
| POST   | `/submit`       | Submit and store a complaint         |
| GET    | `/complaints`   | Get all stored complaints            |
| GET    | `/health`       | Server health + current model mode   |
| GET    | `/config`       | Get current ML config                |
| POST   | `/config`       | Update model mode / endpoint         |

### POST /classify
```json
Request:  { "text": "Fan not working in Hostel B" }
Response: {
  "complaint_type": "Electricity",
  "location": "Hostel B",
  "priority": "Medium",
  "summary": "Fan not working in Hostel B",
  "confidence": 0.87,
  "model_used": "real"
}
```

---

## 🛠 Tech Stack

- **Frontend**: HTML5, Bootstrap 5, Vanilla JS
- **Backend**: Node.js + Express
- **ML Server**: Python + FastAPI (plug your model here)
- **Storage**: In-memory (no database)

---

## ⭐ Features

- ✅ ML-powered auto-classification (custom model, not Gemini)
- ✅ Auto-fill complaint form from model output
- ✅ Editable form after classification
- ✅ Confidence score display
- ✅ Re-classify button
- ✅ Switch between Real ML / Dummy mode at runtime
- ✅ Custom ML endpoint configuration via UI
- ✅ Model ping / test from Settings panel
- ✅ Filter + search complaints
- ✅ Graceful fallback if ML server is down
- ✅ NITJ dark-themed, responsive UI
