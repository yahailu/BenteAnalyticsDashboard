# Bente Analytics — Public Safety Dashboard

## Overview

Bente Analytics is a public safety operational intelligence dashboard designed to support crowd monitoring, hotspot identification, resource allocation, predictive forecasting, event monitoring, and incident investigation.

The dashboard is intended for pilot deployment with local Police Departments and hospitality partners.

---

## Quick Start

1. Download all project files into the same folder.
2. Open `index.html` using Google Chrome or Microsoft Edge.
3. Internet connection is required for map tiles and heatmap rendering.
4. The dashboard loads automatically.

If browser security restrictions prevent local data loading, run the project using VS Code Live Server.

---

## Project Files

| File                        | Description                       |
| --------------------------- | ---------------------------------- |
| index.html                  | Main dashboard application         |
| style.css                   | Dashboard styling and layout       |
| script.js                   | Dashboard functionality and logic  |
| data.js                     | Operational dataset                |
| bente_city_master_12000.csv | Master dataset                     |

---

## Dashboard Modules

### Home

Officer landing page providing a quick operational snapshot.

Includes:

* Officer greeting and jurisdiction
* Current time and shift status
* Operational summary (critical/high-risk venues, zone alerts)
* Quick navigation to all dashboard modules

### Situation Report

Operational overview of current public safety conditions.

Includes:

* Critical venues
* High-risk venues
* Active patrol zones
* Peak activity periods
* Recommended officer actions
* Priority watch list
* Geographic filters — County, City, Zone

### Live Heatmap

Real-time visualization of crowd concentration and venue risk.

Includes:

* Crowd density heatmap
* Risk-level venue markers
* Operational search
* Active incident feed
* Venue investigation access

### Trends & Forecast

Predictive analysis and deployment planning.

Includes:

* Peak risk periods
* Deployment forecasting
* Predicted crowd activity
* Future hotspot identification

### Investigation

Operational lookup and incident review.

Includes:

* Venue search
* Presence log
* Timeline analysis
* Officer intelligence summaries
* Geographic filters — County, City

### Events Monitoring

Identifies events driving crowd density at venues.

Includes:

* Active event listings
* Event category, size, and time window
* Crowd density and risk level per event
* Geographic filters — County, City, Zone, Event Type, Risk Level
* Direct links to map and investigation

### AI Agent

Operational assistant for natural language queries.

Includes:

* Plain-language operational questions
* Zone, county, and venue-specific responses
* Suggested questions for quick access
* Recommended officer actions based on live dataset

---

## Risk Levels

| Level    | Recommended Action |
| -------- | ------------------- |
| Critical | Immediate Response   |
| High     | Monitor Closely      |
| Elevated | Routine Patrol       |
| Normal   | No Action Required   |

---

## Technology Stack

* HTML5
* CSS3
* JavaScript
* Leaflet.js
* Chart.js
* OpenStreetMap
* Claude Code

---

## Notes

This dashboard uses a simulated city-scale dataset for demonstration and pilot evaluation purposes.

The architecture is designed to support future integration with live operational data sources.
