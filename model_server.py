"""
NITJ Complaint Classification — Dummy FastAPI ML Server
========================================================
This is the EXAMPLE ML model server that the Node.js backend talks to.

Replace the classify() function body with your real model inference code.

Install dependencies:
    pip install fastapi uvicorn

Run:
    uvicorn model_server:app --host 0.0.0.0 --port 8000 --reload

POST /predict
    Request : { "text": "complaint text" }
    Response: { "complaint_type": "...", "location": "...", "priority": "...",
                "summary": "...", "confidence": 0.92 }
"""

import re
import time
import random
from typing import Optional

try:
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
except ImportError:
    raise SystemExit(
        "\n[ERROR] FastAPI not installed.\n"
        "Run: pip install fastapi uvicorn\n"
    )


# ─── App Setup ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="NITJ Complaint Classifier",
    description="ML-powered complaint classification for NIT Jalandhar",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request / Response Schemas ───────────────────────────────────────────────
class PredictRequest(BaseModel):
    text: str


class PredictResponse(BaseModel):
    complaint_type: str
    location: str
    priority: str
    summary: str
    confidence: Optional[float] = None
    processing_time_ms: Optional[float] = None


# ─── Keyword-Based Classifier (REPLACE WITH YOUR REAL MODEL) ─────────────────
"""
HOW TO PLUG IN YOUR REAL MODEL
================================
1. Load your model at startup using the @app.on_event("startup") hook below.
2. Replace the body of rule_based_classify() with model.predict(text).
3. Map the model output to the required fields.

Example for a scikit-learn model:
    import joblib
    model = joblib.load("complaint_classifier.pkl")

    def classify(text):
        label = model.predict([text])[0]
        proba = model.predict_proba([text]).max()
        return label, proba
"""

TYPE_RULES = [
    (["electricity", "power", "fan", "light", "bulb", "ac", "air condition",
      "switch", "socket", "wiring", "short circuit", "mcb"],  "Electricity"),
    (["water", "pipe", "leakage", "tap", "drainage", "sewage",
      "flush", "blockage", "tank"],                            "Water Supply"),
    (["wifi", "internet", "network", "connection", "bandwidth",
      "router", "lan", "ethernet"],                            "IT / Network"),
    (["hostel", "room", "window", "door", "lock", "bed",
      "mattress", "furniture", "warden"],                      "Hostel"),
    (["road", "path", "footpath", "pothole", "construction",
      "building", "wall", "ceiling", "roof"],                  "Civil / Infrastructure"),
    (["mess", "food", "canteen", "meal", "dining",
      "kitchen", "menu", "quality"],                           "Mess / Canteen"),
    (["library", "book", "journal", "reading", "catalogue"],   "Library"),
    (["transport", "bus", "vehicle", "parking", "driver"],     "Transport"),
]

LOCATION_RULES = [
    (["hostel a", "block a"],         "Hostel A"),
    (["hostel b", "block b"],         "Hostel B"),
    (["hostel c", "block c"],         "Hostel C"),
    (["hostel d", "block d"],         "Hostel D"),
    (["main building", "admin"],      "Main Building"),
    (["library"],                     "Library"),
    (["lab", "laboratory", "workshop"], "Laboratory"),
    (["canteen", "mess", "dining"],   "Mess / Canteen"),
    (["ground", "sports", "field"],   "Sports Ground"),
    (["auditorium", "seminar"],       "Auditorium"),
]

PRIORITY_RULES = [
    (["urgent", "emergency", "danger", "hazard", "critical",
      "fire", "flood", "safety", "immediately"],  "High"),
    (["not working", "broken", "damaged", "failed",
      "issue", "problem"],                         "Medium"),
]


def rule_based_classify(text: str) -> PredictResponse:
    """
    ⚠️  DUMMY IMPLEMENTATION — Replace with your real ML model here.
    """
    lower = text.lower()

    # Type
    complaint_type = "General"
    for keywords, label in TYPE_RULES:
        if any(k in lower for k in keywords):
            complaint_type = label
            break

    # Location
    location = "Campus (General)"
    for keywords, label in LOCATION_RULES:
        if any(k in lower for k in keywords):
            location = label
            break

    # Priority
    priority = "Low"
    for keywords, label in PRIORITY_RULES:
        if any(k in lower for k in keywords):
            priority = label
            break

    # Summary: first 12 words
    words = re.split(r"\s+", text.strip())
    summary = " ".join(words[:12]) + ("..." if len(words) > 12 else "")

    # Simulated confidence (replace with real model proba)
    confidence = round(random.uniform(0.72, 0.96), 4)

    return PredictResponse(
        complaint_type=complaint_type,
        location=location,
        priority=priority,
        summary=summary,
        confidence=confidence,
    )


# ─── Optional: Real model loader ─────────────────────────────────────────────
# Uncomment and modify this block to load your actual model at startup.
#
# real_model = None
#
# @app.on_event("startup")
# async def load_model():
#     global real_model
#     import joblib
#     real_model = joblib.load("your_model.pkl")
#     print("[ML] Model loaded ✓")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "service": "NITJ Complaint Classifier",
        "status": "running",
        "predict_endpoint": "/predict",
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": "dummy-rules"}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    text = req.text.strip()

    if not text or len(text) < 3:
        raise HTTPException(status_code=400, detail="Text is too short.")

    start = time.perf_counter()
    result = rule_based_classify(text)

    # --- Replace above line with real model call if available ---
    # if real_model:
    #     label = real_model.predict([text])[0]
    #     proba = float(real_model.predict_proba([text]).max())
    #     result = PredictResponse(
    #         complaint_type=label,
    #         location="Campus (General)",   # extract or default
    #         priority="Medium",             # extract or default
    #         summary=text[:80],
    #         confidence=proba,
    #     )
    # else:
    #     result = rule_based_classify(text)

    elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
    result.processing_time_ms = elapsed_ms

    return result


# ─── Run directly ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    try:
        import uvicorn
        print("\n🤖 NITJ ML Model Server starting on http://localhost:8000")
        print("📚 Docs available at http://localhost:8000/docs\n")
        uvicorn.run("model_server:app", host="0.0.0.0", port=8000, reload=True)
    except ImportError:
        raise SystemExit("Run: pip install uvicorn")
