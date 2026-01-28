document.addEventListener('DOMContentLoaded', function() {
    // Initialize map centered on UNN
    const map = L.map('map', {
        zoomControl: false,
        gestureHandling: true
    }).setView([6.8670, 7.3980], 16);
    
    // Base layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri'
    });
    
    const hybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        attribution: '© Google',
        subdomains: ['mt0','mt1','mt2','mt3']
    });
    
    // Layer control
    document.querySelectorAll('input[name="layer"]').forEach(radio => {
        radio.addEventListener('change', function() {
            map.removeLayer(osmLayer);
            map.removeLayer(satelliteLayer);
            map.removeLayer(hybridLayer);
            
            switch(this.value) {
                case 'osm':
                    osmLayer.addTo(map);
                    break;
                case 'satellite':
                    satelliteLayer.addTo(map);
                    break;
                case 'hybrid':
                    hybridLayer.addTo(map);
                    break;
            }
        });
    });
    
    // Variables
    let markers = [];
    let currentLocationMarker = null;
    let liveUsers = {};
    let userLocationWatchId = null;
    let currentUserId = null;
    let isLiveSharing = false;
    let liveUsersLayer = null;
    
    // Icon definitions
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
        }),
        sports: L.divIcon({
            html: '<i class="fas fa-running"></i>',
            className: 'custom-marker sports',
            iconSize: [30, 30]
        })
    };
    
    // Load locations
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
                    
                    let popupContent = `
                        <div class="popup-title">${location.name}</div>
                        <div class="popup-details">
                            <p><i class="fas fa-info-circle"></i> ${location.description}</p>
                            <p><i class="fas fa-clock"></i> ${location.hours}</p>
                            <p><i class="fas fa-phone"></i> ${location.contact}</p>
                    `;
                    
                    if (location.wifi_available) {
                        popupContent += `<p><i class="fas fa-wifi"></i> Free WiFi Available</p>`;
                    }
                    if (location.emergency) {
                        popupContent += `<p><i class="fas fa-exclamation-triangle"></i> Emergency Services</p>`;
                    }
                    
                    popupContent += `
                        </div>
                        <div style="margin-top:10px;">
                            <button onclick="navigateTo(${location.lat}, ${location.lng})" 
                                    class="popup-btn">
                                <i class="fas fa-directions"></i> Get Directions
                            </button>
                            <button onclick="saveLocation(${location.lat}, ${location.lng}, '${location.name}')" 
                                    class="popup-btn secondary">
                                <i class="fas fa-bookmark"></i> Save
                            </button>
                        </div>
                    `;
                    
                    marker.bindPopup(popupContent);
                    
                    marker.on('click', function() {
                        showLocationInfo(location);
                    });
                    
                    marker.locationData = location;
                    markers.push(marker);
                });
            })
            .catch(error => console.error('Error loading locations:', error));
    }
    
    // Live Location Functions
    function startLiveSharing() {
        if (!navigator.geolocation) {
            showToast('Geolocation is not supported by your browser', 'error');
            return;
        }
        
        const userName = document.getElementById('userName').value || 'Anonymous User';
        const userColor = document.getElementById('userColor').value;
        
        // Start watching position
        userLocationWatchId = navigator.geolocation.watchPosition(
            position => {
                const { latitude, longitude } = position.coords;
                
                // Update user's own marker
                updateUserMarker(latitude, longitude);
                
                // Send to server if sharing is active
                if (isLiveSharing && currentUserId) {
                    updateServerLocation(latitude, longitude);
                } else if (!currentUserId) {
                    // Start sharing on server
                    startServerSharing(latitude, longitude, userName, userColor);
                }
            },
            error => {
                showToast('Unable to get your location: ' + error.message, 'error');
                stopLiveSharing();
            },
            {
                enableHighAccuracy: true,
                maximumAge: 10000,
                timeout: 5000
            }
        );
    }
    
    function startServerSharing(lat, lng, name, color) {
        fetch('/api/live/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng, name, color })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                currentUserId = data.user_id;
                isLiveSharing = true;
                updateLiveUI(true);
                showToast('Live location sharing started', 'success');
                
                // Start polling for other users
                setInterval(fetchLiveUsers, 3000);
            }
        });
    }
    
    function updateServerLocation(lat, lng) {
        fetch('/api/live/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: currentUserId, lat, lng })
        });
    }
    
    function stopLiveSharing() {
        if (userLocationWatchId) {
            navigator.geolocation.clearWatch(userLocationWatchId);
        }
        
        if (currentUserId) {
            fetch('/api/live/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUserId })
            });
        }
        
        isLiveSharing = false;
        currentUserId = null;
        updateLiveUI(false);
        
        // Remove live user markers
        if (liveUsersLayer) {
            map.removeLayer(liveUsersLayer);
        }
        liveUsers = {};
        
        showToast('Live location sharing stopped', 'info');
    }
    
    function fetchLiveUsers() {
        fetch('/api/live/users')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    updateLiveUsersDisplay(data.users);
                    updateLiveUsersOnMap(data.users);
                }
            });
    }
    
    function updateLiveUsersDisplay(users) {
        const count = Object.keys(users).length;
        document.getElementById('liveUsers').innerHTML = `<span>${count} users online</span>`;
        document.getElementById('mobileLiveStatus').innerHTML = `<i class="fas fa-circle"></i> ${count}`;
        
        // Update live users panel
        const liveUsersList = document.getElementById('liveUsersList');
        if (liveUsersList) {
            liveUsersList.innerHTML = '';
            Object.values(users).forEach(user => {
                if (user.name !== (document.getElementById('userName').value || 'Anonymous User')) {
                    const userItem = document.createElement('div');
                    userItem.className = 'live-user-item';
                    userItem.innerHTML = `
                        <div class="live-user-color" style="background:${user.color}"></div>
                        <div class="live-user-name">${user.name}</div>
                    `;
                    liveUsersList.appendChild(userItem);
                }
            });
            
            document.getElementById('liveUsersPanel').querySelector('h4').innerHTML = 
                `<i class="fas fa-users"></i> Live Users (${count})`;
        }
    }
    
    function updateLiveUsersOnMap(users) {
        if (!map || !users) return;
        
        // Remove existing layer
        if (liveUsersLayer) {
            map.removeLayer(liveUsersLayer);
        }
        
        // Create new layer
        const liveUserMarkers = [];
        Object.values(users).forEach(user => {
            // Don't show own marker twice
            if (user.name === (document.getElementById('userName').value || 'Anonymous User')) return;
            
            const marker = L.marker([user.lat, user.lng], {
                icon: L.divIcon({
                    html: `<i class="fas fa-user" style="color:${user.color}"></i>`,
                    className: 'custom-marker live-user',
                    iconSize: [25, 25]
                })
            }).bindPopup(`
                <div class="popup-title">${user.name}</div>
                <div class="popup-details">
                    <p><i class="fas fa-circle" style="color:${user.color}"></i> Live Location</p>
                    <p><i class="fas fa-clock"></i> Last updated: ${new Date(user.last_update).toLocaleTimeString()}</p>
                </div>
            `);
            liveUserMarkers.push(marker);
        });
        
        liveUsersLayer = L.layerGroup(liveUserMarkers);
        if (document.getElementById('liveToggleBtn').classList.contains('active')) {
            liveUsersLayer.addTo(map);
        }
    }
    
    function updateUserMarker(lat, lng) {
        if (currentLocationMarker) {
            map.removeLayer(currentLocationMarker);
        }
        
        currentLocationMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                html: '<i class="fas fa-circle" style="color:#006400"></i>',
                className: 'custom-marker user-location',
                iconSize: [20, 20]
            })
        }).addTo(map).bindPopup('You are here');
        
        // Auto-pan to user location on first update
        if (!window.userLocated) {
            map.setView([lat, lng], 16);
            window.userLocated = true;
        }
    }
    
    function updateLiveUI(isActive) {
        const startBtn = document.getElementById('startLiveBtn');
        const stopBtn = document.getElementById('stopLiveBtn');
        const mobileStatus = document.getElementById('mobileLiveStatus');
        
        if (isActive) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            mobileStatus.style.color = '#00ff00';
            mobileStatus.title = 'Live location active';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            mobileStatus.style.color = '#ff6b6b';
            mobileStatus.title = 'Live location inactive';
        }
    }
    
    // UI Functions
    function showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    function showLocationInfo(location) {
        const infoDiv = document.getElementById('locationInfo');
        infoDiv.innerHTML = `
            <h3><i class="fas fa-info-circle"></i> ${location.name}</h3>
            <div class="location-details">
                <p><strong>Type:</strong> ${location.type.charAt(0).toUpperCase() + location.type.slice(1)}</p>
                <p><strong>Description:</strong> ${location.description}</p>
                <p><strong>Hours:</strong> ${location.hours}</p>
                <p><strong>Contact:</strong> ${location.contact}</p>
                ${location.wifi_available ? '<p><i class="fas fa-wifi"></i> Free WiFi Available</p>' : ''}
                ${location.emergency ? '<p><i class="fas fa-exclamation-triangle"></i> Emergency Services</p>' : ''}
            </div>
            <div class="location-actions">
                <button onclick="getDirectionsTo(${location.lat}, ${location.lng})" class="action-btn">
                    <i class="fas fa-directions"></i> Get Directions
                </button>
                <button onclick="shareLocation(${location.lat}, ${location.lng}, '${location.name}')" class="action-btn secondary">
                    <i class="fas fa-share"></i> Share
                </button>
            </div>
        `;
    }
    
    // Event Listeners
    document.getElementById('startLiveBtn').addEventListener('click', startLiveSharing);
    document.getElementById('stopLiveBtn').addEventListener('click', stopLiveSharing);
    
    document.getElementById('liveToggleBtn').addEventListener('click', function() {
        this.classList.toggle('active');
        if (this.classList.contains('active') && liveUsersLayer) {
            liveUsersLayer.addTo(map);
        } else if (liveUsersLayer) {
            map.removeLayer(liveUsersLayer);
        }
    });
    
    // Mobile menu toggle
    document.getElementById('menuToggle').addEventListener('click', function() {
        document.getElementById('sidebar').classList.add('show');
    });
    
    document.getElementById('closeSidebar').addEventListener('click', function() {
        document.getElementById('sidebar').classList.remove('show');
    });
    
    // Bottom navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const target = this.dataset.target;
            
            // Remove active class from all buttons
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            switch(target) {
                case 'map':
                    // Nothing to do, map is already visible
                    break;
                case 'search':
                    document.getElementById('searchInput').focus();
                    break;
                case 'live':
                    // Toggle live users panel
                    const panel = document.getElementById('liveUsersPanel');
                    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
                    break;
                case 'directions':
                    // Show directions panel
                    document.getElementById('mobileDirections').classList.add('show');
                    break;
                case 'menu':
                    document.getElementById('sidebar').classList.add('show');
                    break;
            }
        });
    });
    
    // Close directions panel
    document.querySelector('.close-directions').addEventListener('click', function() {
        document.getElementById('mobileDirections').classList.remove('show');
    });
    
    // Get mobile directions
    document.getElementById('mobileGetDirectionsBtn').addEventListener('click', function() {
        const to = document.getElementById('mobileToInput').value;
        if (!to) {
            showToast('Please enter a destination', 'error');
            return;
        }
        
        // Simulate directions
        const resultDiv = document.getElementById('mobileDirectionsResult');
        resultDiv.innerHTML = `
            <div class="directions-steps">
                <div class="step">
                    <div class="step-icon">1</div>
                    <div class="step-content">
                        <strong>Start</strong>
                        <p>From your current location</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-icon">2</div>
                    <div class="step-content">
                        <strong>Walk north-east</strong>
                        <p>200 meters along the main path</p>
                    </div>
                </div>
                <div class="step">
                    <div class="step-icon">3</div>
                    <div class="step-content">
                        <strong>Arrive at destination</strong>
                        <p>${to}</p>
                    </div>
                </div>
            </div>
            <div class="directions-summary">
                <p><i class="fas fa-route"></i> Distance: 0.5 km</p>
                <p><i class="fas fa-clock"></i> Time: 8 mins</p>
            </div>
        `;
    });
    
    // Compass orientation
    if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', function(event) {
            const compass = document.getElementById('compass');
            if (compass) {
                compass.style.transform = `rotate(${event.alpha || 0}deg)`;
            }
        });
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
                            document.getElementById('searchInput').value = '';
                        });
                        resultsContainer.appendChild(item);
                    });
                }
                
                resultsContainer.style.display = 'block';
            });
    }
    
    // Quick actions
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            switch(action) {
                case 'nearest-food':
                    // Find nearest cafeteria/food location
                    const foodLocation = markers.find(m => 
                        m.locationData.name.toLowerCase().includes('cafeteria') || 
                        m.locationData.name.toLowerCase().includes('union')
                    );
                    if (foodLocation) {
                        map.setView(foodLocation.getLatLng(), 17);
                        foodLocation.openPopup();
                    }
                    break;
                case 'nearest-library':
                    const library = markers.find(m => 
                        m.locationData.name.toLowerCase().includes('library')
                    );
                    if (library) {
                        map.setView(library.getLatLng(), 17);
                        library.openPopup();
                    }
                    break;
                case 'nearest-medical':
                    const medical = markers.find(m => 
                        m.locationData.name.toLowerCase().includes('medical') ||
                        m.locationData.type === 'health'
                    );
                    if (medical) {
                        map.setView(medical.getLatLng(), 17);
                        medical.openPopup();
                    }
                    break;
                case 'save-location':
                    if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(pos => {
                            const { latitude, longitude } = pos.coords;
                            const name = prompt('Name this location:', 'My Saved Location');
                            if (name) {
                                saveCustomMarker(latitude, longitude, name);
                            }
                        });
                    }
                    break;
            }
        });
    });
    
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
    
    // Map controls
    document.getElementById('locateBtn').addEventListener('click', function() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], 17);
                showToast('Location updated', 'success');
            });
        }
    });
    
    document.getElementById('zoomInBtn').addEventListener('click', () => map.zoomIn());
    document.getElementById('zoomOutBtn').addEventListener('click', () => map.zoomOut());
    
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
    
    // Initialize
    loadLocations();
    
    // Add custom marker function
    window.saveCustomMarker = function(lat, lng, name) {
        const description = prompt('Add a description (optional):');
        
        fetch('/api/marker', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                lat, 
                lng, 
                name, 
                description: description || '',
                type: 'custom'
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                showToast('Location saved successfully', 'success');
                // Add marker to map immediately
                const marker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        html: '<i class="fas fa-star"></i>',
                        className: 'custom-marker saved',
                        iconSize: [30, 30]
                    })
                }).addTo(map).bindPopup(`
                    <div class="popup-title">${name}</div>
                    <div class="popup-details">
                        <p>${description || 'Custom saved location'}</p>
                    </div>
                `);
                markers.push(marker);
            }
        });
    };
    
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
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            font-size: 16px;
        }
        .custom-marker.academic { border-color: #006400; color: #006400; }
        .custom-marker.administrative { border-color: #8B4513; color: #8B4513; }
        .custom-marker.residential { border-color: #1E90FF; color: #1E90FF; }
        .custom-marker.health { border-color: #DC143C; color: #DC143C; }
        .custom-marker.sports { border-color: #FF8C00; color: #FF8C00; }
        .custom-marker.live-user { border-color: transparent; }
        .custom-marker.user-location { border-color: #006400; color: #006400; }
        .custom-marker.saved { border-color: #FFD700; color: #FFD700; }
        .popup-btn {
            padding: 8px 12px;
            background: #006400;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            margin-right: 5px;
            display: inline-block;
        }
        .popup-btn.secondary {
            background: #6c757d;
        }
        .popup-btn:hover {
            opacity: 0.9;
        }
        .directions-steps {
            margin-top: 20px;
        }
        .step {
            display: flex;
            margin-bottom: 15px;
            padding: 10px;
            background: #f8f9fa;
            border-radius: 8px;
        }
        .step-icon {
            width: 30px;
            height: 30px;
            background: #006400;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 10px;
            font-weight: bold;
        }
        .step-content {
            flex: 1;
        }
        .directions-summary {
            background: #e9f7ef;
            padding: 15px;
            border-radius: 8px;
            margin-top: 15px;
        }
        .directions-summary p {
            margin: 5px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .location-actions {
            display: flex;
            gap: 10px;
            margin-top: 15px;
        }
    `;
    document.head.appendChild(style);
});

// Global functions
function navigateTo(lat, lng) {
    const map = document.querySelector('#map')._leaflet_map;
    map.setView([lat, lng], 18);
    showToast('Navigation started', 'info');
}

function getDirectionsTo(lat, lng) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const startLat = position.coords.latitude;
            const startLng = position.coords.longitude;
            
            fetch(`/api/directions?start_lat=${startLat}&start_lng=${startLng}&end_lat=${lat}&end_lng=${lng}`)
                .then(response => response.json())
                .then(data => {
                    alert(`Directions to location:\nDistance: ${data.distance}\nDuration: ${data.duration}`);
                });
        });
    }
}

function shareLocation(lat, lng, name) {
    if (navigator.share) {
        navigator.share({
            title: `Location: ${name}`,
            text: `Check out this location at UNN`,
            url: `https://maps.google.com/?q=${lat},${lng}`
        });
    } else {
        // Fallback
        const shareUrl = `https://maps.google.com/?q=${lat},${lng}`;
        navigator.clipboard.writeText(shareUrl);
        alert('Link copied to clipboard!');
    }
}

function saveLocation(lat, lng, name) {
    localStorage.setItem('saved_location_' + Date.now(), JSON.stringify({
        lat, lng, name, timestamp: new Date().toISOString()
    }));
    alert('Location saved locally!');
}