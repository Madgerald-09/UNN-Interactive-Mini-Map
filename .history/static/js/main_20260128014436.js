document.addEventListener('DOMContentLoaded', function() {
    // Fix for mobile viewport height
    function setViewportHeight() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        
        // Fix container height for mobile
        const container = document.querySelector('.container');
        const sidebar = document.querySelector('.sidebar');
        const mapContainer = document.querySelector('.map-container');
        
        if (window.innerWidth <= 768) {
            const topBarHeight = document.querySelector('.mobile-top-bar').offsetHeight || 60;
            const bottomNavHeight = document.querySelector('.bottom-nav').offsetHeight || 60;
            
            if (sidebar.classList.contains('show')) {
                container.style.height = `calc(100vh - ${topBarHeight}px)`;
                sidebar.style.height = `calc(100vh - ${topBarHeight + bottomNavHeight}px)`;
                mapContainer.style.display = 'none';
            } else {
                container.style.height = `calc(100vh - ${topBarHeight}px)`;
                mapContainer.style.height = `calc(100vh - ${topBarHeight + bottomNavHeight}px)`;
                mapContainer.style.display = 'block';
            }
        } else {
            container.style.height = '100vh';
            mapContainer.style.height = '100%';
            mapContainer.style.display = 'block';
        }
    }
    
    // Initialize map with responsive settings
    const map = L.map('map', {
        zoomControl: false,
        gestureHandling: true,
        touchZoom: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        dragging: true,
        tap: L.Browser.touch ? false : true,
        tapTolerance: 15
    }).setView([6.8670, 7.3980], 16);
    
    // Base layers with retina support
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        detectRetina: L.Browser.retina
    }).addTo(map);
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '© Esri',
        detectRetina: L.Browser.retina
    });
    
    const hybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        attribution: '© Google',
        subdomains: ['mt0','mt1','mt2','mt3'],
        detectRetina: L.Browser.retina
    });
    
    // Layer control with touch optimization
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
    let isSidebarOpen = false;
    
    // Responsive icon sizes
    function getIconSize() {
        if (window.innerWidth <= 480) return [24, 24];
        if (window.innerWidth <= 768) return [26, 26];
        return [30, 30];
    }
    
    // Icon definitions with responsive sizes
    const iconTypes = {
        academic: L.divIcon({
            html: '<i class="fas fa-graduation-cap"></i>',
            className: 'custom-marker academic',
            iconSize: getIconSize()
        }),
        administrative: L.divIcon({
            html: '<i class="fas fa-landmark"></i>',
            className: 'custom-marker administrative',
            iconSize: getIconSize()
        }),
        residential: L.divIcon({
            html: '<i class="fas fa-home"></i>',
            className: 'custom-marker residential',
            iconSize: getIconSize()
        }),
        health: L.divIcon({
            html: '<i class="fas fa-hospital"></i>',
            className: 'custom-marker health',
            iconSize: getIconSize()
        }),
        sports: L.divIcon({
            html: '<i class="fas fa-running"></i>',
            className: 'custom-marker sports',
            iconSize: getIconSize()
        })
    };
    
    // Load locations with responsive markers
    function loadLocations() {
        f
            .then(response => response.json())
            .then(data => {
                markers.forEach(marker => map.removeLayer(marker));
                markers = [];
                
                // Use marker clustering for better performance on mobile
                if (window.innerWidth <= 768 && data.locations.length > 20) {
                    const markerCluster = L.markerClusterGroup({
                        maxClusterRadius: 60,
                        spiderfyOnMaxZoom: true,
                        showCoverageOnHover: false,
                        zoomToBoundsOnClick: true,
                        chunkedLoading: true,
                        chunkInterval: 100,
                        singleMarkerMode: false,
                        spiderLegPolylineOptions: {
                            weight: 1.5,
                            color: '#006400',
                            opacity: 0.5
                        }
                    });
                    
                    data.locations.forEach(location => {
                        const marker = createMarker(location);
                        markerCluster.addLayer(marker);
                        markers.push(marker);
                    });
                    
                    map.addLayer(markerCluster);
                } else {
                    data.locations.forEach(location => {
                        const marker = createMarker(location);
                        marker.addTo(map);
                        markers.push(marker);
                    });
                }
            })
            .catch(error => console.error('Error loading locations:', error));
    }
    
    function createMarker(location) {
        const icon = iconTypes[location.type] || L.divIcon({
            html: '<i class="fas fa-map-marker-alt"></i>',
            className: 'custom-marker default',
            iconSize: getIconSize()
        });
        
        const marker = L.marker([location.lat, location.lng], { icon });
        
        let popupContent = `
            <div class="popup-title">${location.name}</div>
            <div class="popup-details">
                <p><i class="fas fa-info-circle"></i> ${location.description || 'UNN Building'}</p>
        `;
        
        if (location.hours) popupContent += `<p><i class="fas fa-clock"></i> ${location.hours}</p>`;
        if (location.contact) popupContent += `<p><i class="fas fa-phone"></i> ${location.contact}</p>`;
        if (location.wifi_available) popupContent += `<p><i class="fas fa-wifi"></i> Free WiFi Available</p>`;
        if (location.emergency) popupContent += `<p><i class="fas fa-exclamation-triangle"></i> Emergency Services</p>`;
        
        popupContent += `
            </div>
            <div style="margin-top:10px; display:flex; gap:5px; flex-wrap:wrap;">
                <button onclick="navigateTo(${location.lat}, ${location.lng})" 
                        class="popup-btn">
                    <i class="fas fa-directions"></i> Directions
                </button>
                <button onclick="saveLocation(${location.lat}, ${location.lng}, '${location.name.replace(/'/g, "\\'")}')" 
                        class="popup-btn secondary">
                    <i class="fas fa-bookmark"></i> Save
                </button>
            </div>
        `;
        
        marker.bindPopup(popupContent, {
            maxWidth: Math.min(300, window.innerWidth * 0.8),
            className: 'custom-popup'
        });
        
        marker.on('click', function() {
            showLocationInfo(location);
        });
        
        marker.locationData = location;
        return marker;
    }
    
    // Mobile sidebar handling
    document.getElementById('menuToggle').addEventListener('click', function() {
        toggleSidebar(true);
    });
    
    document.getElementById('closeSidebar').addEventListener('click', function() {
        toggleSidebar(false);
    });
    
    function toggleSidebar(show) {
        const sidebar = document.getElementById('sidebar');
        const mapContainer = document.querySelector('.map-container');
        
        if (window.innerWidth <= 768) {
            if (show) {
                sidebar.classList.add('show');
                mapContainer.style.display = 'none';
                isSidebarOpen = true;
            } else {
                sidebar.classList.remove('show');
                mapContainer.style.display = 'block';
                isSidebarOpen = false;
            }
            setViewportHeight();
        } else {
            sidebar.classList.toggle('show', show);
            isSidebarOpen = show;
        }
    }
    
    // Bottom navigation for mobile
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const target = this.dataset.target;
            
            // Remove active class from all buttons
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            switch(target) {
                case 'map':
                    toggleSidebar(false);
                    break;
                case 'search':
                    toggleSidebar(true);
                    setTimeout(() => {
                        document.getElementById('searchInput').focus();
                    }, 300);
                    break;
                case 'live':
                    toggleSidebar(true);
                    // Live section is in sidebar
                    break;
                case 'directions':
                    document.getElementById('mobileDirections').classList.add('show');
                    break;
                case 'menu':
                    toggleSidebar(!isSidebarOpen);
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
    
    // Live Location Functions with mobile optimizations
    function startLiveSharing() {
        if (!navigator.geolocation) {
            showToast('Geolocation is not supported by your browser', 'error');
            return;
        }
        
        const userName = document.getElementById('userName').value || 'Anonymous User';
        const userColor = document.getElementById('userColor').value;
        
        // Check permissions on mobile
        if (window.innerWidth <= 768) {
            if (!('permissions' in navigator)) {
                // Request location directly
                requestLocationPermission();
            } else {
                navigator.permissions.query({name: 'geolocation'})
                    .then(permissionStatus => {
                        if (permissionStatus.state === 'granted') {
                            requestLocationPermission();
                        } else if (permissionStatus.state === 'prompt') {
                            requestLocationPermission();
                        } else {
                            showToast('Location permission denied. Please enable in browser settings.', 'error');
                        }
                    });
            }
        } else {
            requestLocationPermission();
        }
        
        function requestLocationPermission() {
            // Start watching position with mobile optimizations
            const options = {
                enableHighAccuracy: true,
                maximumAge: window.innerWidth <= 768 ? 15000 : 10000,
                timeout: window.innerWidth <= 768 ? 10000 : 5000
            };
            
            userLocationWatchId = navigator.geolocation.watchPosition(
                position => {
                    const { latitude, longitude } = position.coords;
                    
                    // Update user's own marker
                    updateUserMarker(latitude, longitude);
                    
                    // Send to server if sharing is active
                    if (isLiveSharing && currentUserId) {
                        updateServerLocation(latitude, longitude);
                    } else if (!currentUserId) {
                        startServerSharing(latitude, longitude, userName, userColor);
                    }
                },
                error => {
                    showToast('Unable to get your location: ' + error.message, 'error');
                    stopLiveSharing();
                },
                options
            );
        }
    }
    
    // Rest of the live location functions remain the same...
    // [Keep all your existing live location functions]
    
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
                <p><strong>Description:</strong> ${location.description || 'UNN Building'}</p>
                ${location.hours ? `<p><strong>Hours:</strong> ${location.hours}</p>` : ''}
                ${location.contact ? `<p><strong>Contact:</strong> ${location.contact}</p>` : ''}
                ${location.wifi_available ? '<p><i class="fas fa-wifi"></i> Free WiFi Available</p>' : ''}
                ${location.emergency ? '<p><i class="fas fa-exclamation-triangle"></i> Emergency Services</p>' : ''}
            </div>
            <div class="location-actions">
                <button onclick="getDirectionsTo(${location.lat}, ${location.lng})" class="action-btn">
                    <i class="fas fa-directions"></i> Get Directions
                </button>
                <button onclick="shareLocation(${location.lat}, ${location.lng}, '${location.name.replace(/'/g, "\\'")}')" class="action-btn secondary">
                    <i class="fas fa-share"></i> Share
                </button>
            </div>
        `;
        
        // Auto-scroll to location info on mobile
        if (window.innerWidth <= 768) {
            infoDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
    
    // Search functionality with mobile optimizations
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
                            <small>${location.description || location.type}</small>
                        `;
                        item.addEventListener('click', () => {
                            map.setView([location.lat, location.lng], 18);
                            const marker = markers.find(m => m.locationData.id === location.id);
                            if (marker) {
                                if (marker.getPopup()) {
                                    marker.openPopup();
                                } else {
                                    // For clustered markers
                                    map.setView([location.lat, location.lng], Math.max(map.getZoom(), 18));
                                }
                            }
                            resultsContainer.style.display = 'none';
                            document.getElementById('searchInput').value = '';
                            
                            // Close sidebar on mobile after selection
                            if (window.innerWidth <= 768) {
                                toggleSidebar(false);
                            }
                        });
                        resultsContainer.appendChild(item);
                    });
                }
                
                resultsContainer.style.display = 'block';
                
                // Adjust position on mobile
                if (window.innerWidth <= 768) {
                    const searchBox = document.querySelector('.search-box');
                    resultsContainer.style.top = (searchBox.offsetTop + searchBox.offsetHeight + 10) + 'px';
                    resultsContainer.style.left = '20px';
                    resultsContainer.style.width = 'calc(100% - 40px)';
                }
            });
    }
    
    // Map controls with touch optimizations
    document.getElementById('locateBtn').addEventListener('click', function() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(position => {
                const { latitude, longitude } = position.coords;
                map.setView([latitude, longitude], Math.max(map.getZoom(), 17));
                showToast('Location updated', 'success');
            }, error => {
                showToast('Could not get your location: ' + error.message, 'error');
            }, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        }
    });
    
    document.getElementById('zoomInBtn').addEventListener('click', () => {
        map.zoomIn();
        // Add haptic feedback on mobile
        if (navigator.vibrate) navigator.vibrate(10);
    });
    
    document.getElementById('zoomOutBtn').addEventListener('click', () => {
        map.zoomOut();
        if (navigator.vibrate) navigator.vibrate(10);
    });
    
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
    
    // Compass orientation for mobile
    if (window.DeviceOrientationEvent && window.innerWidth <= 768) {
        document.querySelector('.compass').style.display = 'flex';
        window.addEventListener('deviceorientation', function(event) {
            const compass = document.getElementById('compass');
            if (compass) {
                compass.style.transform = `rotate(${event.alpha || 0}deg)`;
            }
        });
        
        // Compass click to reset orientation
        document.getElementById('compass').addEventListener('click', function() {
            map.setView([6.8670, 7.3980], 16);
        });
    }
    
    // Window resize handler
    window.addEventListener('resize', function() {
        setViewportHeight();
        
        // Update icon sizes
        markers.forEach(marker => {
            if (marker.locationData) {
                const newIcon = iconTypes[marker.locationData.type] || L.divIcon({
                    html: '<i class="fas fa-map-marker-alt"></i>',
                    className: 'custom-marker default',
                    iconSize: getIconSize()
                });
                marker.setIcon(newIcon);
            }
        });
        
        // Handle sidebar on resize
        if (window.innerWidth > 768) {
            document.getElementById('sidebar').classList.remove('show');
            document.querySelector('.map-container').style.display = 'block';
            isSidebarOpen = false;
        }
    });
    
    // Load building outlines (GeoJSON) with mobile optimization
    fetch('/api/geojson/buildings')
        .then(response => response.json())
        .then(data => {
            const buildingLayer = L.geoJSON(data, {
                style: function(feature) {
                    return {
                        fillColor: '#228B22',
                        fillOpacity: window.innerWidth <= 768 ? 0.2 : 0.3,
                        color: '#006400',
                        weight: window.innerWidth <= 768 ? 1.5 : 2,
                        opacity: 0.8
                    };
                },
                onEachFeature: function(feature, layer) {
                    if (feature.properties && feature.properties.name) {
                        const name = feature.properties.name;
                        const description = feature.properties.description || '';
                        const levels = feature.properties['building:levels'] || '';
                        
                        let popupContent = `<b>${name}</b>`;
                        if (description) popupContent += `<br>${description}`;
                        if (levels) popupContent += `<br>Floors: ${levels}`;
                        
                        layer.bindPopup(popupContent, {
                            maxWidth: Math.min(250, window.innerWidth * 0.7)
                        });
                        
                        layer.on('click', function() {
                            if (window.innerWidth <= 768) {
                                // On mobile, show info in sidebar
                                showLocationInfo(feature.properties);
                                toggleSidebar(true);
                            }
                        });
                    }
                }
            }).addTo(map);
            
            window.buildingLayer = buildingLayer;
        })
        .catch(error => console.error('Error loading building outlines:', error));
    
    // Initialize
    setViewportHeight();
    loadLocations();
    
    // Add event listener for orientation change
    window.addEventListener('orientationchange', function() {
        setTimeout(setViewportHeight, 100);
        setTimeout(() => map.invalidateSize(), 150);
    });
    
    // Initialize map size
    setTimeout(() => map.invalidateSize(), 100);
});

// Global functions
function navigateTo(lat, lng) {
    const map = document.querySelector('#map')._leaflet_map;
    map.setView([lat, lng], 18);
    
    // Show toast on mobile, alert on desktop
    if (window.innerWidth <= 768) {
        const toast = document.getElementById('toast');
        toast.textContent = 'Navigation started';
        toast.className = 'toast info';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2000);
    } else {
        alert('Navigation started to location');
    }
}

// Rest of your global functions remain the same...
// [Keep all your existing global functions]