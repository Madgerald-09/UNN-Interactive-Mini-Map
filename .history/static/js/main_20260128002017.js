document.addEventListener('DOMContentLoaded', function() {
    // Initialize map centered on UNN
    const map = L.map('map').setView([6.8670, 7.3980], 16);
    
    // Base layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri'
    });
    
    // Layer control
    document.querySelectorAll('input[name="layer"]').forEach(radio => {
        radio.addEventListener('change', function() {
            if (this.value === 'osm') {
                map.removeLayer(satelliteLayer);
                osmLayer.addTo(map);
            } else {
                map.removeLayer(osmLayer);
                satelliteLayer.addTo(map);
            }
        });
    });
    
    let markers = [];
    let currentLocationMarker = null;
    
    // Marker icons based on type
    const iconTypes = {
        academic: L.divIcon({
            html: '<i class="fas fa-graduation-cap"></i>',
            className: 'custom-marker academic',
            iconSize: [30, 30]
        }),
        administrative: L.divIcon({
            html: '<i class="fas fa-landmark"></i>',
            className: 'custom-marker administrative',
            iconSize: [30, 30]
        }),
        residential: L.divIcon({
            html: '<i class="fas fa-home"></i>',
            className: 'custom-marker residential',
            iconSize: [30, 30]
        }),
        health: L.divIcon({
            html: '<i class="fas fa-hospital"></i>',
            className: 'custom-marker health',
            iconSize: [30, 30]
        })
    };
    
    // Load UNN locations from backend
    function loadLocations() {
        fetch('/api/locations')
            .then(response => response.json())
            .then(data => {
                markers.forEach(marker => map.removeLayer(marker));
                markers = [];
                
                data.locations.forEach(location => {
                    const marker = L.marker([location.lat, location.lng], {
                        icon: iconTypes[location.type] || L.divIcon({
                            html: '<i class="fas fa-map-marker-alt"></i>',
                            className: 'custom-marker default',
                            iconSize: [30, 30]
                        })
                    }).addTo(map);
                    
                    marker.bindPopup(`
                        <div class="popup-title">${location.name}</div>
                        <div class="popup-details">
                            <p><i class="fas fa-info-circle"></i> ${location.description}</p>
                            <p><i class="fas fa-clock"></i> ${location.hours}</p>
                            <p><i class="fas fa-phone"></i> ${location.contact}</p>
                        </div>
                        <button onclick="navigateTo(${location.lat}, ${location.lng})" 
                                style="margin-top:10px; padding:5px 10px; background:#006400; color:white; border:none; border-radius:5px; cursor:pointer;">
                            Get Directions
                        </button>
                    `);
                    
                    marker.locationData = location;
                    markers.push(marker);
                });
            })
            .catch(error => console.error('Error loading locations:', error));
    }
    
    // Search functionality
    document.getElementById('searchBtn').addEventListener('click', performSearch);
    document.getElementById('searchInput').addEventListener('keyup', function(e) {
        if (e.key === 'Enter') performSearch();
    });
    
    function performSearch() {
        const query = document.getElementById('searchInput').value;
        if (!query.trim()) {
            document.getElementById('searchResults').style.display = 'none';
            return;
        }
        
        fetch(`/api/search?q=${encodeURIComponent(query)}`)
            .then(response => response.json())
            .then(data => {
                const resultsContainer = document.getElementById('searchResults');
                resultsContainer.innerHTML = '';
                
                if (data.locations.length === 0) {
                    resultsContainer.innerHTML = '<div class="search-result-item">No results found</div>';
                } else {
                    data.locations.forEach(location => {
                        const item = document.createElement('div');
                        item.className = 'search-result-item';
                        item.innerHTML = `
                            <strong>${location.name}</strong><br>
                            <small>${location.description}</small>
                        `;
                        item.addEventListener('click', () => {
                            map.setView([location.lat, location.lng], 18);
                            markers.find(m => m.locationData.id === location.id).openPopup();
                            resultsContainer.style.display = 'none';
                        });
                        resultsContainer.appendChild(item);
                    });
                }
                
                resultsContainer.style.display = 'block';
            });
    }
    
    // Category filtering
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const type = this.dataset.type;
            markers.forEach(marker => {
                if (type === 'all' || marker.locationData.type === type) {
                    marker.addTo(map);
                } else {
                    map.removeLayer(marker);
                }
            });
        });
    });
    
    // Get user location
    document.getElementById('locateBtn').addEventListener('click', function() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                
                if (currentLocationMarker) {
                    map.removeLayer(currentLocationMarker);
                }
                
                currentLocationMarker = L.marker([latitude, longitude], {
                    icon: L.divIcon({
                        html: '<i class="fas fa-user" style="color:#006400"></i>',
                        className: 'custom-marker user',
                        iconSize: [30, 30]
                    })
                }).addTo(map);
                
                currentLocationMarker.bindPopup('Your current location');
                map.setView([latitude, longitude], 16);
                
                // Auto-fill "From" in directions
                document.getElementById('fromInput').value = `Current Location (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`;
            }, error => {
                alert('Unable to get your location: ' + error.message);
            });
        } else {
            alert('Geolocation is not supported by your browser');
        }
    });
    
    // Get directions
    document.getElementById('getDirectionsBtn').addEventListener('click', function() {
        const from = document.getElementById('fromInput').value;
        const to = document.getElementById('toInput').value;
        
        // For demo, use sample coordinates
        const start = [6.8670, 7.3980];
        const end = markers.length > 0 ? [markers[0].locationData.lat, markers[0].locationData.lng] : [6.8671, 7.3984];
        
        fetch(`/api/directions?start_lat=${start[0]}&start_lng=${start[1]}&end_lat=${end[0]}&end_lng=${end[1]}`)
            .then(response => response.json())
            .then(data => {
                const resultDiv = document.getElementById('directionsResult');
                resultDiv.innerHTML = `
                    <div style="margin-top:10px; padding:10px; background:rgba(255,255,255,0.9); border-radius:5px; color:#333;">
                        <h4><i class="fas fa-route"></i> Route Information</h4>
                        <p><strong>Distance:</strong> ${data.distance}</p>
                        <p><strong>Duration:</strong> ${data.duration}</p>
                        <ol style="margin-top:10px;">
                            ${data.route.map(step => `<li>${step.instruction}</li>`).join('')}
                        </ol>
                    </div>
                `;
                
                // Draw route on map
                if (window.routeLayer) {
                    map.removeLayer(window.routeLayer);
                }
                
                const routePoints = data.route.map(step => [step.lat, step.lng]);
                window.routeLayer = L.polyline(routePoints, {
                    color: '#006400',
                    weight: 4,
                    opacity: 0.7
                }).addTo(map);
            });
    });
    
    // Zoom controls
    document.getElementById('zoomInBtn').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => map.zoomOut());
    
    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', function() {
        const elem = document.querySelector('.map-container');
        if (!document.fullscreenElement) {
            elem.requestFullscreen?.() || 
            elem.webkitRequestFullscreen?.() || 
            elem.msRequestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    });
    
    // Add custom marker on map click
    map.on('click', function(e) {
        const popup = L.popup()
            .setLatLng(e.latlng)
            .setContent(`
                <div style="padding:10px;">
                    <h4 style="margin-bottom:10px;">Add Custom Marker</h4>
                    <input type="text" id="markerName" placeholder="Marker name" style="width:100%; padding:5px; margin-bottom:5px;"><br>
                    <textarea id="markerDesc" placeholder="Description" style="width:100%; padding:5px; margin-bottom:5px; height:60px;"></textarea><br>
                    <button onclick="saveCustomMarker(${e.latlng.lat}, ${e.latlng.lng})" style="width:100%; padding:5px; background:#006400; color:white; border:none;">
                        Save Marker
                    </button>
                </div>
            `)
            .openOn(map);
    });
    
    // Initial load
    loadLocations();
    
    // Add custom CSS for markers
    const style = document.createElement('style');
    style.textContent = `
        .custom-marker {
            display: flex;
            align-items: center;
            justify-content: center;
            background: white;
            border-radius: 50%;
            border: 2px solid;
            box-shadow: 0 2px 5px rgba(0,0,0,0.3);
        }
        .custom-marker.academic { border-color: #006400; color: #006400; }
        .custom-marker.administrative { border-color: #8B4513; color: #8B4513; }
        .custom-marker.residential { border-color: #1E90FF; color: #1E90FF; }
        .custom-marker.health { border-color: #DC143C; color: #DC143C; }
        .custom-marker.user { border-color: #006400; color: #006400; }
        .custom-marker i { font-size: 16px; }
    `;
    document.head.appendChild(style);
});

// Global functions for popup buttons
function navigateTo(lat, lng) {
    const map = document.querySelector('#map')._leaflet_map;
    map.setView([lat, lng], 18);
    document.getElementById('toInput').value = `Destination (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
}

function saveCustomMarker(lat, lng) {
    const name = document.getElementById('markerName').value || 'Custom Marker';
    const desc = document.getElementById('markerDesc').value || 'User-added location';
    
    fetch('/api/marker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, name, description: desc })
    })
    .then(response => response.json())
    .then(data => {
        alert('Marker saved successfully!');
        map.closePopup();
    });
}