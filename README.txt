================================================================================
BENTE ANALYTICS & HEATMAP DASHBOARD
Public Safety & Operational Intelligence Platform
================================================================================

PROJECT OVERVIEW
----------------
A CompStat 360-style operational intelligence dashboard designed for crowd
monitoring, hotspot analysis, predictive forecasting, and incident investigation.
Built for pilot deployment with local Police Departments and hospitality partners.

================================================================================

SETUP INSTRUCTIONS
------------------
1. Keep all project files in the same folder
2. Open index.html in a web browser
3. Recommended browsers: Google Chrome or Microsoft Edge
4. Internet connection required for map functionality (OpenStreetMap tiles)

================================================================================

PROJECT FILES
-------------
index.html                      → Main dashboard application
style.css                       → Dashboard styling
script.js                       → Dashboard logic and data processing
data.js                         → Operational dataset (1,200 records, 26 columns)
bente_master_dataset_1200.csv   → Master dataset for both teams (26 columns)
README.txt                      → This file

================================================================================

DASHBOARD MODULES
-----------------
Home
  Navigation hub with platform overview and module access

Situation Map
  Live crowd density heatmap with venue markers, risk levels,
  patrol zones, active incidents feed, and Quick Access venue lookup

Trends & Forecast
  Day × hour activity matrix, peak period analysis, weekday vs weekend
  patterns, weather impact, patrol zone breakdown, and 24-hour
  predictive crowd deployment forecast with per-venue projections

Investigation
  Venue presence lookup for authorized law enforcement partners.
  Returns who was present, timestamps, crowd conditions, incident flags,
  officer action required, crowd spike detection, and operational context

================================================================================

DATASET
-------
- 1,200 check-in records across 10 monitored venues
- 26 columns covering operational and segmentation fields
- 6 patrol zones: Downtown, Harbor District, Midtown,
  Waterfront, North End, Commercial

INCIDENT FLAGS (auto-assigned by crowd density):
  CRITICAL  ≥ 85  →  Immediate Response
  HIGH      ≥ 70  →  Monitor Closely
  ELEVATED  ≥ 50  →  Routine Patrol
  NORMAL    < 50  →  No Action Required

VENUE RISK LEVELS:
  Critical  — Metro Nightclub, Harborview Bar
  High      — Grand Theater, Seaside Restaurant
  Elevated  — City Mall, Downtown Food Court, Riverwalk Park
  Normal    — Central Coffee House, Greenfield Gym, TechHub Coworking

================================================================================

TEAM DATA USAGE
---------------
Public Safety / Police Dashboard uses:
  checkin_id, user_id, venue_name, venue_category, latitude, longitude,
  timestamp, crowd_density, avg_dwell_minutes, day_of_week, hour_of_day,
  is_weekend, weather_condition, incident_flag, officer_action,
  patrol_zone, activity_type

Recommendation / Segmentation Team uses:
  checkin_id, user_id, venue_name, venue_category, user_age_group,
  user_preference, visit_frequency, user_engagement_score,
  venue_popularity_score, event_type, user_status, recommended_venue

================================================================================

TECHNOLOGIES
------------
- HTML, CSS, JavaScript
- Leaflet.js — Interactive map and heatmap
- Chart.js — Data visualizations
- OpenStreetMap — Map tiles

================================================================================

NOTES
-----
This project uses a simulated operational dataset for prototype and
demonstration purposes. Designed for real data integration into the
Bente platform: https://menu.getbente.com/

================================================================================

CONTACT
-------
Name  : [Your Name / Team Name]
Email : [Your Email]
Date  : [Delivery Date]

================================================================================
