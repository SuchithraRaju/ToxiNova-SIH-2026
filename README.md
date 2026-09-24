# ToxiNova_FullStack_SIH — AI/ML version

This version keeps the original ToxiNova standalone dashboard frontend and adds a Python FastAPI backend with a scikit-learn Ridge Regression model.

## AI/ML flow
Photo → RGB pixel extraction → CIELAB → ΔE → Backend API → Ridge Regression → cumulative H₂S dose (ppm-h) → 8-hour TWA → dashboard/history.

## Run backend
Open the folder that contains this README (`ToxiNova_SIH_Working_AI`) in VS Code, then open a terminal:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python server.py
```

Backend: http://127.0.0.1:5001

Check: http://127.0.0.1:5001/api/health

## Run frontend
Open a second terminal:

```powershell
cd frontend
python -m http.server 5500
```

Then open http://127.0.0.1:5500

Do not double-click index.html; use the local server.

## AI model
The model is Ridge Regression. Inputs are ΔE, temperature and humidity. Output is estimated cumulative exposure in ppm-hours. The model is trained at backend startup using `backend/ml/trainingData.csv`.

The included CSV is demonstration data, not experimentally validated H₂S calibration data. Replace it with controlled laboratory measurements for final validation.


## Working AI/ML test
1. Start `backend/server.py` and confirm `http://127.0.0.1:5001` is running.
2. Start the frontend with `python -m http.server 5500` from the `frontend` folder.
3. Open `http://127.0.0.1:5500`.
4. The AI card changes from `AI BACKEND CHECKING…` to `AI BACKEND CONNECTED` when the Python backend is reachable.
5. Upload a wristband image, click **Auto-detect sensing strip**, then **Analyze exposure**.
6. The browser calculates RGB/CIELAB/ΔE and sends ΔE + temperature + humidity + shift hours to `/api/exposure`. The Python Ridge Regression model returns dose and 8-hour TWA.

### Important prototype limitation
The model is genuinely executed by scikit-learn, but its current CSV contains demonstration calibration data rather than controlled laboratory H₂S measurements. Do not present the current numerical accuracy as experimentally validated.
