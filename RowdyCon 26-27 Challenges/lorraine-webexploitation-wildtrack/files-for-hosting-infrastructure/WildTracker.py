import os 
from flask import Flask, request, render_template_string, abort

app = Flask(__name__)

ANIMALS = {
    1: {"name": "Red Fox", "status": "Healthy", "public": True, "coords": "29.5843 N, -98.6184 W",},
    2: {"name": "Grey Wolf", "status": "Healthy", "public": True, "coords": "29.5912 N, -98.6231 W",},
    3: {"name": "Snow Leopard", "status": "Monitoring", "public": True, "coords": "29.5645 N, -98.6210 W",},
    4: {"name": "Sea Turtle", "status": "Healthy", "public": True, "coords": "27.6324 N, -97.2145 W",},
    5: {"name": "Bald Eagle", "status": "Fully Recovered", "public": True, "coords": "29.5789 N, -98.6112 W",},
    6: {"name": "White-Tailed Deer", "status": "Abundant", "public": True, "coords": "29.5521 N, -98.6015 W",},
    7: {"name": "Northern Cardinal", "status": "Stable", "public": True, "coords": "29.5621 N, -98.5984 W",},
    8: {"name": "Plains Zerbra", "status": "Stable", "public": True, "coords": "-1.2921 S, 36.8219 E",},
    9: {"name": "Chacma Baboon", "status": "Abundant", "public": True, "coords": "-2.1543 S, 34.6857 E",},
    10: {"name": "Hyena", "status": "Healthy", "public": True, "coords": "-3.2415 S, 35.5122 E",},
    11: {"name": "Vervet Monkey", "status": "Abundant", "public": True, "coords": "-1.3524 S, 36.6021 E",},
    12: {
        "name": "Pangolins",
        "status": "CONFIDENTIAL - Active poaching threat",
        "public": False,
        "coords": "29.4241 N, -98.4936 W",
        "flag": os.environ.get("CTF_FLAG", "RRCC{Please_Don't_Hurt_The_Pangolins}"),
    },
}

DASHBOARD_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WildTrack Dashboard | WildTrack UTSA</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
            background-color: #121212;
            color: #d1d5db;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }

        /* Top Header */
        header {
            background-color: #1f2937;
            height: 50px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            border-bottom: 2px solid #10b981;
        }
        header h1 { font-size: 1.1rem; color: #f9fafb; display: flex; align-items: center; gap: 8px; }
        header h1 span { font-size: 0.75rem; background: #059669; color: #fff; padding: 2px 6px; border-radius: 4px; }
        .user-badge { font-size: 0.85rem; color: #9ca3af; }

        /* Dashboard Grid Layout */
        .dashboard-container {
            display: grid;
            grid-template-columns: 280px 1fr 300px;
            gap: 8px;
            padding: 8px;
            height: calc(100vh - 50px);
            
        }

        .panel {
            background-color: #1a1a1a;
            border: 1px solid #343333;
            border-radius: 4px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            
        }
        .dashboard-container > .panel:nth-child(1),
        .dashboard-container > .panel:nth-child(3) {
        background-color: #343232
}

        .panel-header {
            background-color: #242424;
            padding: 10px 14px;
            font-size: 0.85rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            color: #9ca3af;
            border-bottom: 1px solid #2d2d2d;
        }

        /* KPI Stat Cards */
        .kpi-container { padding: 12px; display: flex; flex-direction: column; gap: 10px; }
        .kpi-card {
            background: #242424;
            border-left: 4px solid #10b981;
            padding: 12px;
            border-radius: 4px;
        }
        .kpi-card.warning { border-left-color: #f59e0b; }
        .kpi-card.alert-card { border-left-color: #ef4444; }
        .kpi-value { font-size: 1.8rem; font-weight: bold; color: #ffffff; }
        .kpi-label { font-size: 0.75rem; color: #9ca3af; text-transform: uppercase; }

        /* Species List */
        .species-list { list-style: none; overflow-y: auto; flex: 1; }
        .species-item {
            padding: 12px 14px;
            border-bottom: 1px solid #000000;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .species-item a { color: #60a5fa; text-decoration: none; font-weight: 500; font-size: 0.9rem; }
        .species-item a:hover { text-decoration: underline; }
        .status-tag {
            font-size: 0.75rem;
            padding: 2px 8px;
            border-radius: 12px;
            background: #064e3b;
            color: #34d399;
        }
        .status-tag.monitoring { background: #78350f; color: #fbbf24; }

        /* Right Panel*/
        .feed-container { padding: 12px; overflow-y: auto; font-size: 0.85rem; display: flex; flex-direction: column; gap: 10px; }
        .feed-item { background: #242424; padding: 10px; border-radius: 4px; border-left: 3px solid #6b7280; }
        .feed-item.alert { border-left-color: #f59e0b; background: #2e2211; color: #fde68a; }
    </style>
</head>
<body>

    <header>
        <h1>🌐 WildTrack <span>ArcGIS Dashboard</span></h1>
        <div class="user-badge">Role: <strong>{{ role }}</strong></div>
    </header>

    <div class="dashboard-container">
        
        
        <div class="panel">
            <div class="panel-header">System Metrics</div>
            <div class="kpi-container">
                <div class="kpi-card">
                    <div class="kpi-value">12</div>
                    <div class="kpi-label">Active Signals</div>
                </div>
                <div class="kpi-card warning">
                    <div class="kpi-value">1</div>
                    <div class="kpi-label">Under Watch</div>
                </div>
                <div class="kpi-card alert-card">
                    <div class="kpi-value">1</div>
                    <div class="kpi-label">Restricted Layer</div>
                </div>
            </div>

            <div class="panel-header">Public Sightings Layer</div>
            <ul class="species-list">
                {% for id, a in animals.items() if a.public %}
                <li class="species-item">
                    <a href="/animal/{{ id }}">{{ a.name }}</a>
                    <span class="status-tag {% if a.status == 'Monitoring' %}monitoring{% endif %}">{{ a.status }}</span>
                </li>
                {% endfor %}
            </ul>
        </div>

        <!UTSA Terminal Console Monitor >
        <div class="panel">
            <div class="panel-header">Ranger Terminal Monitor</div>
            <div style="background: #000; padding: 15px; font-family: monospace; color: #39ff14; height: 100%; overflow-y: auto; line-height: 1.6;">
                <p>[08:42:12] SYSTEM INIT: UTSA WildTrack Gateway v2.4...</p>
                <p>[08:42:15] AUTH: Guest Session Established</p>
                <p>[08:43:01] SENSOR: (Snow Leopard) Heartbeat OK</p>
                <p>[08:45:00] GRID: Listening on 0.0.0.0:5000...</p>
                <p>[08:46:10] GPS_FEED: Red Fox Broadcaster -> 29.5843° N, 98.6184° W</p>
                <p>[08:46:14] GPS_FEED: Grey Wolf Broadcaster -> 29.5912° N, 98.6231° W</p>
                <p>[08:46:22] GPS_FEED: Sea Turtle Broadcaster -> 27.6324° N, 97.2145° W</p>
                <p>[08:46:35] GPS_FEED: White-Tailed Deer Broadcaster  -> 29.5789° N, 98.6112° W</p>
                <p>[08:47:01] GPS_FEED: Northern Cardinal Broadcaster  -> 29.5621° N, 98.5984° W</p>
                <p>[08:47:15] GPS_FEED: Plains Zebra Broadcaster  -> -1.2921° S, 36.8219° E</p>
                <p>[08:47:40] GPS_FEED: Chacma Baboon Broadcaster -> -25.7479° S, 28.2294° E</p>
                <p>[08:48:02] GPS_FEED: Hyena Broadcaster -> -2.1543° S, 34.6857° E</p>
                <p>[08:48:19] GPS_FEED: Vervet Monkey Broadcaster -> -1.3524° S, 36.6021° E</p>
                <p>[08:49:00] SENSOR: Snow Leopard Heartbeat OK</p>
                <p>[08:49:01] [08:49:10] SYSTEM: Automated background sync complete for all 12 tracked assets.</p>

            </div>
        </div>

        <!-- Right Sidebar: Operational Feeds -->
        <div class="panel">
            <div class="panel-header">Collar Telemetry Feed</div>
            <div class="feed-container">
                <div class="feed-item">
                    <strong>Snow Leopard</strong><br>
                    Signal refreshed 2 mins ago.
                </div>
                <div class="feed-item">
                    <strong>Bald Eagle</strong><br>
                    Telemetry ping received from confidential zone.
                </div>
                <div class="feed-item">
                    <strong>Grey Wolf</strong><br>
                    ↳ Signal: Stable | Battery: 91% | Activity: Pack Movement
                    ↳ Diagnostics: Geofence boundary verified.
                </div>
                <div class="feed-item">
                    <strong>Bald Eagle</strong><br>
                    Telemetry ping received from confidential zone.
                </div>
                <div class="feed-item">
                    <strong>Red Fox</strong><br>
                    ↳ Signal: Strong | Battery: 88% | Activity: Foraging
                    ↳ Diagnostics: Local corridor passage verified.
                </div>
                <div class="feed-item">
                    <strong>Vervet Monkey</strong><br>
                     ↳ Signal: High | Battery: 87% | Activity: Canopy Foraging
                     ↳ Diagnostics: High acceleration vector detected (jumping).
                </div>
                <div class="feed-item">
                    <strong>Plains Zebra</strong><br>
                      ↳ Signal: Roaming Link | Battery: 69% | Activity: Great Migration Route
                      ↳ Diagnostics: Base station proximity transponder alert.

                </div>

                <div class="feed-item alert">
                    <strong>Security Alert:</strong><br>
                    ⚠ Confidentiality Notice: Location data for high-risk species is 
                    restricted due to active poaching threats in this region.
                </div>
            </div>
        </div>

    </div>

</body>
</html>
"""

ANIMAL_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{ animal.name }} - Record Details</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            background-color: #121212; 
            color: #d1d5db; 
            margin: 0;
            padding: 40px 20px;
            display: flex;
            justify-content: center;
        }
        .card { 
            background: #1a1a1a; 
            padding: 24px; 
            border-radius: 6px; 
            border: 1px solid #2d2d2d;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5); 
            width: 100%;
            max-width: 500px; 
        }
        h1 {
            margin-top: 0;
            color: #f9fafb;
            font-size: 1.4rem;
            border-bottom: 1px solid #2d2d2d;
            padding-bottom: 12px;
            margin-bottom: 16px;
        }
        p { margin-bottom: 12px; font-size: 0.95rem; }
        .btn { 
            display: inline-block;
            color: #38bdf8; 
            text-decoration: none;
            font-weight: 600;
            padding: 8px 16px;
            border: 1px solid #2d2d2d;
            border-radius: 4px;
            background-color: #242424;
            margin-top: 15px;
        }
        .btn:hover { background-color: #2d2d2d; }
        .flag {
            background-color: #064e3b;
            color: #34d399;
            padding: 12px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 1rem;
            border-left: 4px solid #10b981;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>{{ animal.name }}</h1>
        <p><strong>Status:</strong> {{ animal.status }}</p>
        <p><strong>Coordinates:</strong> {{ animal.coords }}</p>
        {% if animal.flag %}<div class="flag"><strong>CTF Flag:</strong> {{ animal.flag }}</div>{% endif %}
        <p><a href="/dashboard" class="btn">← Return to Dashboard</a></p>
    </div>
</body>
</html>
"""

@app.route('/dashboard')
def dashboard():
    user_role = request.args.get('role', 'guest')
    return render_template_string(DASHBOARD_TEMPLATE, role=user_role, animals=ANIMALS)

@app.route('/animal/<int:animal_id>')
def animal_detail(animal_id):
    animal = ANIMALS.get(animal_id)
    if animal is None:
        abort(404)

    return render_template_string(ANIMAL_TEMPLATE, animal=animal)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)