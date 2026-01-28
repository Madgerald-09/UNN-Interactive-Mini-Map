from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import json
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)

# Load UNN location data
def load_locations():
    locations_file = 'data/unn_locations.json'
    
    # If file doesn't exist, create sample UNN data
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
                    "description": "Main university library",
                    "contact": "08012345678",
                    "hours": "8:00 AM - 10:00 PM"
                },
                {
                    "id": 2,
                    "name": "Faculty of Engineering",
                    "type": "academic",
                    "lat": 6.8668,
                    "lng": 7.3979,
                    "floor": 0,
                    "description": "Engineering complex",
                    "contact": "08023456789",
                    "hours": "7:30 AM - 6:00 PM"
                },
                {
                    "id": 3,
                    "name": "Student Union Building",
                    "type": "administrative",
                    "lat": 6.8675,
                    "lng": 7.3989,
                    "floor": 0,
                    "description": "Student activities center",
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
                    "hours": "24/7"
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
                    "hours": "24/7 Emergency"
                }
            ]
        }
        
        os.makedirs('data', exist_ok=True)
        with open(locations_file, 'w') as f:
            json.dump(sample_data, f, indent=2)
        
        return sample_data
    
    with open(locations_file, 'r') as f:
        return json.load(f)

# Route to serve main page
@app.route('/')
def index():
    return render_template('index.html')

# API endpoint to get all locations
@app.route('/api/locations', methods=['GET'])
def get_locations():
    data = load_locations()
    return jsonify(data)

# API endpoint to search locations
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

# API endpoint to get directions (simplified)
@app.route('/api/directions', methods=['GET'])
def get_directions():
    start_lat = float(request.args.get('start_lat', 6.8670))
    start_lng = float(request.args.get('start_lng', 7.3980))
    end_lat = float(request.args.get('end_lat', 6.8671))
    end_lng = float(request.args.get('end_lng', 7.3984))
    
    # Simplified directions - in real app, use routing algorithm
    directions = {
        "route": [
            {"lat": start_lat, "lng": start_lng, "instruction": "Start here"},
            {"lat": (start_lat + end_lat)/2, "lng": (start_lng + end_lng)/2, "instruction": "Continue straight"},
            {"lat": end_lat, "lng": end_lng, "instruction": "Arrive at destination"}
        ],
        "distance": "0.5 km",  # Calculate actual distance
        "duration": "8 mins"
    }
    
    return jsonify(directions)

# API endpoint to add custom marker
@app.route('/api/marker', methods=['POST'])
def add_marker():
    data = request.json
    # In production, save to database
    return jsonify({
        "success": True,
        "message": "Marker added (demo mode)",
        "data": data
    })

if __name__ == '__main__':
    app.run(debug=True, port=5000)