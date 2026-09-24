from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.linear_model import Ridge

import csv
import math
import os
import numpy as np


# ============================================================
# SERVER CONFIGURATION
# ============================================================

PORT = int(os.getenv("PORT", "5001"))

app = FastAPI(
    title="ToxiNova H2S AI/ML Backend"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"]
)


# ============================================================
# TRAINING DATA
# ============================================================

CSV_PATH = os.path.join(
    os.path.dirname(__file__),
    "ml",
    "trainingData.csv"
)


X = []
y = []


with open(CSV_PATH, encoding="utf-8") as f:

    reader = csv.DictReader(f)

    for row in reader:

        delta_e = float(row["deltaE"])
        temperature = float(row["temperature"])
        humidity = float(row["humidity"])
        dose = float(row["dose_ppm_h"])

        X.append([
            delta_e,
            temperature,
            humidity
        ])

        y.append(dose)


X = np.array(X)
y = np.array(y)


# ============================================================
# RIDGE REGRESSION MODEL
# ============================================================
#
# Pipeline:
#
# ΔE + Temperature + Humidity
#             ↓
#     Polynomial Features
#             ↓
#       Standardization
#             ↓
#       Ridge Regression
#             ↓
#      H2S Dose (ppm-h)
#
# Polynomial features allow the model to represent the
# nonlinear colorimetric calibration curve better than
# a simple straight-line Ridge model.
# ============================================================

MODEL = Pipeline([
    (
        "polynomial",
        PolynomialFeatures(
            degree=3,
            include_bias=False
        )
    ),

    (
        "scaler",
        StandardScaler()
    ),

    (
        "ridge",
        Ridge(alpha=1.0)
    )
])


MODEL.fit(X, y)


# ============================================================
# REQUEST MODEL
# ============================================================

class Exposure(BaseModel):

    workerId: str = "Unknown"

    hours: float = 8

    temperature: float = 30

    humidity: float = 65

    deltaE: float


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/api/health")
def health():

    return {
        "status": "ToxiNova backend running",
        "model": "Polynomial Ridge Regression",
        "trained": True
    }


# ============================================================
# MODEL INFORMATION
# ============================================================

@app.get("/api/model")
def model_info():

    return {

        "model": "Polynomial Ridge Regression",

        "features": [
            "deltaE",
            "temperature",
            "humidity"
        ],

        "target": "cumulative H2S exposure (ppm-h)",

        "training_file": "ml/trainingData.csv",

        "polynomial_degree": 3,

        "environmental_compensation": True,

        "model_note":
            "Prototype model trained on calibration-consistent "
            "prototype data with deterministic environmental "
            "compensation. Final calibration requires controlled "
            "H2S exposure experiments."
    }


# ============================================================
# EXPOSURE PREDICTION
# ============================================================

@app.post("/api/exposure")
def exposure(data: Exposure):

    if not all(math.isfinite(value) for value in (
        data.hours,
        data.temperature,
        data.humidity,
        data.deltaE
    )):
        raise HTTPException(
            status_code=422,
            detail="Exposure values must be finite numbers"
        )

    # --------------------------------------------------------
    # Prepare input
    # --------------------------------------------------------

    features = np.array([
        [
            data.deltaE,
            data.temperature,
            data.humidity
        ]
    ])


    # --------------------------------------------------------
    # AI / ML prediction
    # --------------------------------------------------------

    predicted_dose = float(
        MODEL.predict(features)[0]
    )


    # Prevent physically meaningless negative dose
    dose = max(0.0, predicted_dose)


    # --------------------------------------------------------
    # TWA calculation
    # --------------------------------------------------------

    hours = max(data.hours, 0.1)

    twa = dose / hours


    # --------------------------------------------------------
    # Exposure level
    # --------------------------------------------------------

    if twa >= 4:

        level = "High"

    elif twa >= 2:

        level = "Moderate"

    else:

        level = "Low"


    # --------------------------------------------------------
    # Result
    # --------------------------------------------------------

    result = {

        "workerId": data.workerId,

        "dose": round(dose, 2),

        "twa": round(twa, 2),

        "level": level,

        "model": "Polynomial Ridge Regression",

        "model_note":
            "Prototype Ridge model trained on "
            "calibration-consistent prototype data "
            "with environmental compensation. "
            "Final calibration requires controlled "
            "H2S exposure experiments.",

        "features": {

            "deltaE": round(
                data.deltaE,
                2
            ),

            "temperature": data.temperature,

            "humidity": data.humidity

        }

    }


    records.append(result)

    return result


# ============================================================
# HISTORY
# ============================================================

records = []


@app.get("/api/history")
def history():

    return records


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=PORT
    )