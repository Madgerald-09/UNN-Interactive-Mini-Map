from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import json
import os
from datetime import datetime
import uuid
import threading
import time

app = Flask(__name__)
CORS(app)

# Store active user sessions for live tracking (in production, use Redis)
active_users = {}
live_locations_lock = threading.Lock()

# Enhanced UNN location data
def load_locations():
    locations_file = 'data/unn_locations.json'
    
    if not os.path.exists(locations_file):
        sample_data = {
            "locations": [
                {
                    "id": 1,
                    "name": "Nnamdi Azikiwe Library",
                    "type": "academic",
                    "lat": 6.8671,
                    "lng": 7.3984,
                    "floor": 0,
                    "description": "Main university library with 5 floors",
                    "contact": "08012345678",
                    "hours": "8:00 AM - 10:00 PM",
                    "popular_times": {
                        "8-10": 30, "10-12": 70, "12-2": 90, "2-4": 80, "4-6": 60
                    }
                },
                {
                    "id": 2,
                    "name": "Faculty of Engineering",
                    "type": "academic",
                    "lat": 6.8668,
                    "lng": 7.3979,
                    "floor": 0,
                    "description": "Engineering complex with labs",
                    "contact": "08023456789",
                    "hours": "7:30 AM - 6:00 PM",
                    "wifi_available": True
                },
                {
                    "id": 3,
                    "name": "Student Union Building",
                    "type": "administrative",
                    "lat": 6.8675,
                    "lng": 7.3989,
                    "floor": 0,
                    "description": "Student activities and cafeteria",
                    "contact": "08034567890",
                    "hours": "8:00 AM - 8:00 PM"
                },
                {
                    "id": 4,
                    "name": "Odenigwe Hostel",
                    "type": "residential",
                    "lat": 6.8680,
                    "lng": 7.4001,
                    "floor": 0,
                    "description": "Female hostel block A",
                    "contact": "08045678901",
                    "hours": "24/7",
                    "capacity": 500
                },
                {
                    "id": 5,
                    "name": "Medical Center",
                    "type": "health",
                    "lat": 6.8662,
                    "lng": 7.3995,
                    "floor": 0,
                    "description": "University health services",
                    "contact": "08056789012",
                    "hours": "24/7 Emergency",
                    "emergency": True
                },
                {
                    "id": 6,
                    "name": "Sports Complex",
                    "type": "sports",
                    "lat": 6.8655,
                    "lng": 7.4010,
                    "floor": 0,
                    "description": "Stadium and sports facilities",
                    "contact": "08067890123",
                    "hours": "6:00 AM - 9:00 PM"
                },
                {
                    "id": 7,
                    "name": "Computer Science Building",
                    "type": "academic",
                    "lat": 6.8673,
                    "lng": 7.3975,
                    "floor": 0,
                    "description": "ICT and Computer Science department",
                    "contact": "08078901234",
                    "hours": "8:00 AM - 8:00 PM",
                    "wifi_available": True
                }
            ]
        }
        
        os.makedirs('data', exist_ok=True)
        with open(locations_file, 'w') as f:
            json.dump(sample_data, f, indent=2)
        
        return sample_data
    
    with open(locations_file, 'r') as f:
        return json.load(f)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/locations', methods=['GET'])
def get_locations():
    data = load_locations()
    return jsonify(data)

@app.route('/api/search', methods=['GET'])
def search_locations():
    query = request.args.get('q', '').lower()
    data = load_locations()
    
    if not query:
        return jsonify(data)
    
    filtered = {
        "locations": [
            loc for loc in data["locations"]
            if query in loc["name"].lower() or query in loc["description"].lower()
        ]
    }
    return jsonify(filtered)

# Live Location Tracking Endpoints
@app.route('/api/live/start', methods=['POST'])
def start_live_tracking():
    user_id = str(uuid.uuid4())
    data = request.json
    
    with live_locations_lock:
        active_users[user_id] = {
            "lat": data.get('lat'),
            "lng": data.get('lng'),
            "name": data.get('name', 'Anonymous User'),
            "last_update": datetime.now().isoformat(),
            "color": data.get('color', '#FF0000')
        }
    
    return jsonify({
        "success": True,
        "user_id": user_id,
        "message": "Live tracking started"
    })

@app.route('/api/live/update', methods=['POST'])
def update_live_location():
    data = request.json
    user_id = data.get('user_id')
    
    if not user_id or user_id not in active_users:
        return jsonify({"success": False, "message": "Invalid user ID"}), 404
    
    with live_locations_lock:
        active_users[user_id].update({
            "lat": data.get('lat'),
            "lng": data.get('lng'),
            "last_update": datetime.now().isoformat()
        })
    
    return jsonify({"success": True, "message": "Location updated"})

@app.route('/api/live/stop', methods=['POST'])
def stop_live_tracking():
    user_id = request.json.get('user_id')
    
    with live_locations_lock:
        if user_id in active_users:
            del active_users[user_id]
    
    return jsonify({"success": True, "message": "Tracking stopped"})

@app.route('/api/live/users', methods=['GET'])
def get_live_users():
    with live_locations_lock:
        # Remove stale users (last update > 5 minutes ago)
        now = datetime.now()
        stale_users = []
        for user_id, user_data in active_users.items():
            last_update = datetime.fromisoformat(user_data['last_update'])
            if (now - last_update).total_seconds() > 300:  # 5 minutes
                stale_users.append(user_id)
        
        for user_id in stale_users:
            del active_users[user_id]
        
        return jsonify({
            "success": True,
            "count": len(active_users),
            "users": active_users
        })

# Enhanced directions with live traffic simulation
@app.route('/api/directions', methods=['GET'])
def get_directions():
    start_lat = float(request.args.get('start_lat', 6.8670))
    start_lng = float(request.args.get('start_lng', 7.3980))
    end_lat = float(request.args.get('end_lat', 6.8671))
    end_lng = float(request.args.get('end_lng', 7.3984))
    
    # Simulate walking path with multiple waypoints
    directions = {
        "route": [
            {"lat": start_lat, "lng": start_lng, "instruction": "Start here"},
            {"lat": start_lat + 0.0001, "lng": start_lng + 0.0001, "instruction": "Walk north-east"},
            {"lat": (start_lat + end_lat)/2, "lng": (start_lng + end_lng)/2, "instruction": "Continue straight"},
            {"lat": end_lat - 0.0001, "lng": end_lng - 0.0001, "instruction": "Approaching destination"},
            {"lat": end_lat, "lng": end_lng, "instruction": "Arrive at destination"}
        ],
        "distance": "0.5 km",
        "duration": "8 mins",
        "mode": "walking",
        "traffic": "light"
    }
    
    return jsonify(directions)

@app.route('/api/marker', methods=['POST'])
def add_marker():
    data = request.json
    
    # Save to user_markers.json
    user_markers_file = 'data/user_markers.json'
    if os.path.exists(user_markers_file):
        with open(user_markers_file, 'r') as f:
            user_markers = json.load(f)
    else:
        user_markers = {"markers": []}
    
    data['id'] = len(user_markers['markers']) + 1
    data['timestamp'] = datetime.now().isoformat()
    user_markers['markers'].append(data)
    
    with open(user_markers_file, 'w') as f:
        json.dump(user_markers, f, indent=2)
    
    return jsonify({
        "success": True,
        "message": "Marker saved",
        "data": data
    })

@app.route('/api/user_markers', methods=['GET'])
def get_user_markers():
    user_markers_file = 'data/user_markers.json'
    if os.path.exists(user_markers_file):
        with open(user_markers_file, 'r') as f:
            return jsonify(json.load(f))
    return jsonify({"markers": []})

# Cleanup thread for stale locations
def cleanup_stale_locations():
    while True:
        time.sleep(60)  # Run every minute
        with live_locations_lock:
            now = datetime.now()
            stale_users = []
            for user_id, user_data in active_users.items():
                last_update = datetime.fromisoformat(user_data['last_update'])
                if (now - last_update).total_seconds() > 300:  # 5 minutes
                    stale_users.append(user_id)
            
            for user_id in stale_users:
                del active_users[user_id]

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_stale_locations, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    app.run(debug=True, port=5000, threaded=True)