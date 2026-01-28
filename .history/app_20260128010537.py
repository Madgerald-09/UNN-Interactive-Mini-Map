from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import json
import os
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import threading
import time
import uuid

app = Flask(__name__)
CORS(app)

# UNN bounding box (coordinates that cover the entire campus)
UNN_BBOX = (7.3920, 6.8610, 7.4040, 6.8730)  # min_lon, min_lat, max_lon, max_lat

# Sample UNN building data (will be populated from OSM)
UNN_BUILDINGS = [
    {
        "id": 1,
        "name": "Nnamdi Azikiwe Library",
        "type": "academic",
        "lat": 6.8671,
        "lng": 7.3984,
        "description": "Main university library with 5 floors",
        "contact": "042-771511",
        "hours": "8:00 AM - 10:00 PM"
    },
    {
        "id": 2,
        "name": "Faculty of Engineering",
        "type": "academic",
        "lat": 6.8668,
        "lng": 7.3979,
        "description": "Engineering complex with various departments",
        "contact": "042-771000",
        "hours": "7:30 AM - 6:00 PM"
    },
    {
        "id": 3,
        "name": "VC Building UNN",
        "type": "administrative",
        "lat": 6.8670,
        "lng": 7.3980,
        "description": "Vice Chancellor's Office",
        "contact": "042-770000",
        "hours": "8:00 AM - 5:00 PM"
    },
    {
        "id": 4,
        "name": "Medical Center",
        "type": "health",
        "lat": 6.8662,
        "lng": 7.3995,
        "description": "University health services",
        "contact": "042-771234",
        "hours": "24/7 Emergency"
    },
    {
        "id": 5,
        "name": "Student Union Building",
        "type": "administrative",
        "lat": 6.8675,
        "lng": 7.3989,
        "description": "Student activities center and cafeteria",
        "contact": "042-775555",
        "hours": "8:00 AM - 8:00 PM"
    }
]

# Live location tracking
active_users = {}
live_locations_lock = threading.Lock()

def download_unn_osm_data():
    """Download UNN building data from OpenStreetMap"""
    print("Downloading UNN data from OpenStreetMap...")
    
    overpass_query = f"""
    [out:xml][timeout:180];
    (
      way[{UNN_BBOX[1]},{UNN_BBOX[0]},{UNN_BBOX[3]},{UNN_BBOX[2]}] ["building"];
      node[{UNN_BBOX[1]},{UNN_BBOX[0]},{UNN_BBOX[3]},{UNN_BBOX[2]}] ["building"];
    );
    out body;
    >;
    out skel qt;
    """
    
    try:
        response = requests.post(
            "https://overpass-api.de/api/interpreter",
            data={'data': overpass_query},
            timeout=30
        )
        
        if response.status_code == 200:
            os.makedirs('data', exist_ok=True)
            with open('data/unn_osm.xml', 'w', encoding='utf-8') as f:
                f.write(response.text)
            print(f"Downloaded OSM data ({len(response.text)} bytes)")
            return True
        else:
            print(f"Failed to download OSM data: {response.status_code}")
            return False
    except Exception as e:
        print(f"Error downloading OSM data: {e}")
        return False

def parse_osm_to_buildings():
    """Parse OSM XML and extract building information"""
    try:
        if not os.path.exists('data/unn_osm.xml'):
            print("OSM file not found. Using sample data.")
            return UNN_BUILDINGS
        
        print("Parsing OSM data...")
        tree = ET.parse('data/unn_osm.xml')
        root = tree.getroot()
        
        nodes = {}
        buildings = []
        building_id_counter = 1000
        
        # Extract nodes
        for node in root.findall('node'):
            node_id = node.attrib['id']
            lat = float(node.attrib['lat'])
            lon = float(node.attrib['lon'])
            nodes[node_id] = {'lat': lat, 'lon': lon}
        
        # Extract buildings (ways with building tags)
        for way in root.findall('way'):
            building_tags = {}
            is_building = False
            
            for tag in way.findall('tag'):
                key = tag.attrib['k']
                value = tag.attrib['v']
                building_tags[key] = value
                if key == 'building':
                    is_building = True
            
            if is_building:
                # Get coordinates for this building
                coordinates = []
                for nd in way.findall('nd'):
                    node_ref = nd.attrib['ref']
                    if node_ref in nodes:
                        coords = nodes[node_ref]
                        coordinates.append(coords)
                
                if coordinates and len(coordinates) >= 3:
                    # Calculate center
                    lats = [c['lat'] for c in coordinates]
                    lons = [c['lon'] for c in coordinates]
                    center_lat = sum(lats) / len(lats)
                    center_lon = sum(lons) / len(lons)
                    
                    building = {
                        "id": building_id_counter,
                        "name": building_tags.get('name', f'Building {way.attrib["id"]}'),
                        "type": "building",
                        "lat": center_lat,
                        "lng": center_lon,
                        "description": building_tags.get('description', ''),
                        "levels": building_tags.get('building:levels', ''),
                        "contact": "",
                        "hours": "8:00 AM - 6:00 PM"
                    }
                    
                    # Categorize building
                    name_lower = building['name'].lower()
                    if 'library' in name_lower:
                        building['type'] = 'academic'
                    elif 'medical' in name_lower or 'health' in name_lower:
                        building['type'] = 'health'
                    elif 'hostel' in name_lower:
                        building['type'] = 'residential'
                    elif 'vc' in name_lower or 'admin' in name_lower:
                        building['type'] = 'administrative'
                    elif 'sport' in name_lower or 'stadium' in name_lower:
                        building['type'] = 'sports'
                    
                    buildings.append(building)
                    building_id_counter += 1
        
        print(f"Parsed {len(buildings)} buildings from OSM data")
        
        # Combine with sample data (prioritize sample data names)
        known_buildings = {b['name'].lower(): b for b in UNN_BUILDINGS}
        final_buildings = []
        
        for b in buildings:
            if b['name'].lower() in known_buildings:
                # Use sample data for known buildings
                sample = known_buildings[b['name'].lower()]
                b.update(sample)
            final_buildings.append(b)
        
        # Add any sample buildings not in OSM data
        osm_names = {b['name'].lower() for b in buildings}
        for sample in UNN_BUILDINGS:
            if sample['name'].lower() not in osm_names:
                final_buildings.append(sample)
        
        # Save to file
        with open('data/unn_buildings.json', 'w') as f:
            json.dump({"locations": final_buildings}, f, indent=2)
        
        return final_buildings
        
    except Exception as e:
        print(f"Error parsing OSM: {e}")
        return UNN_BUILDINGS

# Initialize data
print("Initializing UNN Mini-Map...")
if download_unn_osm_data():
    BUILDINGS = parse_osm_to_buildings()
else:
    BUILDINGS = UNN_BUILDINGS
    with open('data/unn_buildings.json', 'w') as f:
        json.dump({"locations": BUILDINGS}, f, indent=2)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/locations')
def get_locations():
    return jsonify({"locations": BUILDINGS})

@app.route('/api/search')
def search_locations():
    query = request.args.get('q', '').lower()
    if not query:
        return jsonify({"locations": BUILDINGS})
    
    results = []
    for building in BUILDINGS:
        if (query in building['name'].lower() or 
            query in building['description'].lower() or
            query in building['type'].lower()):
            results.append(building)
    
    return jsonify({"locations": results})

@app.route('/api/live/start', methods=['POST'])
def start_live_tracking():
    user_id = str(uuid.uuid4())
    data = request.json
    
    with live_locations_lock:
        active_users[user_id] = {
            "lat": data.get('lat', 6.8670),
            "lng": data.get('lng', 7.3980),
            "name": data.get('name', 'Anonymous'),
            "color": data.get('color', '#FF0000'),
            "last_update": datetime.now().isoformat()
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
        return jsonify({"success": False}), 404
    
    with live_locations_lock:
        active_users[user_id].update({
            "lat": data.get('lat'),
            "lng": data.get('lng'),
            "last_update": datetime.now().isoformat()
        })
    
    return jsonify({"success": True})

@app.route('/api/live/users')
def get_live_users():
    with live_locations_lock:
        # Clean up old users (older than 5 minutes)
        now = datetime.now()
        stale_users = []
        for uid, user in active_users.items():
            last_update = datetime.fromisoformat(user['last_update'])
            if (now - last_update).total_seconds() > 300:
                stale_users.append(uid)
        
        for uid in stale_users:
            del active_users[uid]
        
        return jsonify({
            "count": len(active_users),
            "users": active_users
        })

@app.route('/api/directions')
def get_directions():
    # Simplified directions - returns a walking path
    start_lat = float(request.args.get('start_lat', 6.8670))
    start_lng = float(request.args.get('start_lng', 7.3980))
    end_lat = float(request.args.get('end_lat', 6.8671))
    end_lng = float(request.args.get('end_lng', 7.3984))
    
    # Create a simple path with 5 points
    points = []
    steps = 5
    for i in range(steps + 1):
        lat = start_lat + (end_lat - start_lat) * (i / steps)
        lng = start_lng + (end_lng - start_lng) * (i / steps)
        points.append({"lat": lat, "lng": lng})
    
    return jsonify({
        "route": points,
        "distance": "0.5 km",
        "duration": "8 mins",
        "mode": "walking"
    })

def cleanup_thread():
    """Background thread to clean up old live locations"""
    while True:
        time.sleep(60)
        with live_locations_lock:
            now = datetime.now()
            stale_users = []
            for uid, user in active_users.items():
                last_update = datetime.fromisoformat(user['last_update'])
                if (now - last_update).total_seconds() > 300:
                    stale_users.append(uid)
            
            for uid in stale_users:
                del active_users[uid]

# Start cleanup thread
threading.Thread(target=cleanup_thread, daemon=True).start()

if __name__ == '__main__':
    print("\n" + "="*50)
    print("UNN Mini-Map Server Starting...")
    print(f"Loaded {len(BUILDINGS)} buildings")
    print("Open your browser to: http://localhost:5000")
    print("="*50 + "\n")
    app.run(debug=True, host='0.0.0.0', port=5000)