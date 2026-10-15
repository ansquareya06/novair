# NOVAIR – Emergency Intelligence & Response Platform
*Predict. Prepare. Respond.*

A disaster response and emergency resource management system: incident reporting, risk prediction,
resource and inventory tracking, responder dispatch, shelters and alerts, on an interactive district map.

**Stack:** JavaScript only – Node.js (built-in `http`), **MySQL** (via the `mysql2` package), vanilla JS/HTML/CSS frontend.

> All district numbers, history and sensor readings are **sample / simulated data** for demonstration.
> There is no real IoT hardware. Replace the sample data with verified data before any real use.

## Requirements
- Node.js 18 or newer (`node -v`)
- MySQL 8 running on your machine (MySQL Server + Workbench is fine)

## Run it (VS Code terminal)
1. Copy `.env.example` to `.env` and put your MySQL password in it
   (Windows: `copy .env.example .env` · Mac/Linux: `cp .env.example .env`).
2. Install the one dependency: `npm install`
3. Create the database and load the sample data: `npm run setup`
   (generates simulated history, trains the models, creates the `novair` database and its tables)
4. Start the server: `npm start`
5. Open **http://localhost:3000**

To look at the data, refresh the schemas in MySQL Workbench and open the `novair` database, or run e.g.
`SELECT * FROM incidents;` · `SELECT * FROM alerts ORDER BY id DESC;` · `SELECT * FROM assignments;`

**Troubleshooting**
- `ECONNREFUSED` → MySQL is not running.
- `Access denied for user` → wrong `MYSQL_USER` / `MYSQL_PASSWORD` in `.env`.
- `Unknown database` or missing tables → run `npm run setup` again (it drops and recreates the tables).

### Demo logins (password for all: `NOVAIR@2026`)
| Role | Email | Can do |
|---|---|---|
| Administrator | admin@novair.com | everything: map, report, forecast, resources, responders, shelters, inventory, alerts, data, users |
| Field Staff | staff@novair.com | update ambulance/responder dispatch status and numbers, update inventory, view map, shelters, alerts |
| Citizen | citizen@novair.com | report incidents and see own reports |

Roles are enforced on the server (see `backend/api.js`), not just hidden in the UI.

## How it works
```
incident report + district data + simulated sensors
   -> risk class (multinomial logistic regression)
   -> expected injured (Poisson / Negative Binomial regression)
   -> resource demand  vs  availability  -> shortages
   -> responder allocation (nearest station with spare units, Dijkstra)
   -> alerts  -> map colour updates
```
- **Models** (`models/`): `train.js` fits the models on `data/historical_incidents.csv` (simulated) with
  gradient descent (multinomial logit) and IRLS (Poisson). It checks overdispersion with the Pearson χ²/df;
  if it is above 1.5 the Negative Binomial variance `μ + αμ²` is used (α by method of moments).
  Coefficients and test accuracy are written to `models/coefficients.json`.
- **Routing** (`backend/routing.js`): Dijkstra's algorithm on the `routes` table (road distances between district HQs, sample values).
- **Simulated sensors** (`backend/api.js`): a random walk for water level, rainfall, temperature and crowd, polled every 3 s.
- **Polling**: the frontend refreshes state every 10 s (no WebSockets).

## Project structure
```
backend/     server.js (http server) · api.js (all endpoints + prediction/alert/dispatch logic) · db.js (MySQL layer) · config.js · auth.js · routing.js · dbUtils.js
models/      riskModel.js (prediction) · train.js (fitting) · coefficients.json (generated)
data/        districts.json (sample districts + routes) · historical_incidents.csv (generated, simulated)
database/    schema.sql (MySQL) · seed.js
static/      css/style.css · js/app.js (frontend)
templates/   index.html
scripts/     makeSampleData.js
frontend/    prototype-offline.html (the original single-file prototype, runs without the server)
```
Database tables: users, districts, incidents, sensor_readings, historical_incidents, hospitals, shelters,
responders, resources, inventory, predictions, alerts, routes (+ assignments, activity_log, inventory_log).

## API (JSON, cookie session)
`POST /api/login` · `POST /api/logout` · `GET /api/me` · `GET /api/state` · `GET /api/sensors` ·
`POST /api/incidents` · `PUT /api/assignments/:id` · `POST /api/dispatch` · `POST /api/inventory` ·
`POST /api/inventory/allocate` · `PUT /api/districts/:id` · `POST /api/districts/:id/areas`

## Limitations (be upfront about these in a viva)
- Models are trained on **simulated** history, so the probabilities show the method, not real-world accuracy.
- Sample district data, routes and distances are illustrative.
- The map is a schematic tile map, not true district boundaries.
- Demo passwords and in-memory sessions are for a prototype, not production.

Ananya Sahu 2427030501
