/**
 * ARTEMIS TRACKER - CUSTOM JAVASCRIPT
 * Clean, functional mission tracker
 */

// ============================================
// GLOBAL VARIABLES & SCENE SETUP
// ============================================

let scene, camera, renderer, controls;
let earth, earthClouds, moon, orionModel;
let stars = [];
let launchMarker;

// Mission parameters
const LAUNCH_DATE = (typeof window.ARTEMIS_LAUNCH_EPOCH === 'number') 
    ? window.ARTEMIS_LAUNCH_EPOCH 
    : new Date('2026-02-09T04:20:00Z').getTime();
const TRACKER_PREVIEW_MODE = getTrackerModelPreviewMode();
const ORION_PREVIEW_MISSION_OFFSET_MS = 24 * 60 * 60 * 1000;
const ORION_MODEL_SWITCH_OFFSET_MS = 10 * 60 * 1000;
// NASA Artemis II press kit lists TLI at MET +1/01:37.
const TLI_BURN_START_MET_MS = ((25 * 60) + 37) * 60 * 1000;
// Public NASA materials give the planned start time but not a public second-by-second end time.
const TLI_BURN_NOTICE_WINDOW_MS = 20 * 60 * 1000;
const TOTAL_MISSION_DURATION_MS = (typeof window.ARTEMIS_MISSION_DURATION_MS === 'number')
    ? window.ARTEMIS_MISSION_DURATION_MS
    : 10 * 24 * 60 * 60 * 1000;
const EARTH_RADIUS = 6371; // km
const MOON_DISTANCE = 384400; // km
const MOON_RADIUS = 1737; // km

const EARTH_DISTANCE_PROFILE = [
    { timeMs: 0, distanceKm: 0 },
    { timeMs: 1 * 60 * 60 * 1000, distanceKm: 185 },
    { timeMs: 2 * 60 * 60 * 1000, distanceKm: 1600 },
    { timeMs: 24 * 60 * 60 * 1000, distanceKm: 98000 },
    { timeMs: 4 * 24 * 60 * 60 * 1000, distanceKm: 370000 },
    { timeMs: 7 * 24 * 60 * 60 * 1000, distanceKm: 185000 },
    { timeMs: 9 * 24 * 60 * 60 * 1000, distanceKm: 28000 },
    { timeMs: 10 * 24 * 60 * 60 * 1000, distanceKm: 0 }
];

const VELOCITY_PROFILE = [
    { timeMs: 0, velocityKmps: 0 },
    { timeMs: 8 * 60 * 1000, velocityKmps: 7.8 },
    { timeMs: 2 * 60 * 60 * 1000, velocityKmps: 10.8 },
    { timeMs: 24 * 60 * 60 * 1000, velocityKmps: 4.1 },
    { timeMs: 4 * 24 * 60 * 60 * 1000, velocityKmps: 1.6 },
    { timeMs: 7 * 24 * 60 * 60 * 1000, velocityKmps: 2.8 },
    { timeMs: 9 * 24 * 60 * 60 * 1000, velocityKmps: 6.9 },
    { timeMs: 10 * 24 * 60 * 60 * 1000, velocityKmps: 11.0 }
];

const DISTANCE_WIDGET_DEFAULTS = {
    restUrl: '',
    earthRadiusKm: EARTH_RADIUS,
    defaultUnits: 'mi',
    showPeakBadge: true,
    showSourceLabel: false,
    peakScope: 'local',
    apollo13RecordKm: 393800,
    clientRefreshMs: 5000
};
const DISTANCE_UNIT_STORAGE_KEY = 'artemisDistanceUnit';
const DISTANCE_LOCAL_PEAK_STORAGE_KEY = 'artemisDistanceLocalPeakKm';
let distanceCounterState = {
    unit: 'mi',
    localPeakKm: 0,
    missionPeakKm: null,
    serverSnapshot: null,
    fetchIntervalId: null,
    fetchPromise: null
};

// Current Orion position (will update during mission)
// Kennedy Space Center coordinates: 28.573469°N, -80.651070°W
const KSC_LAT = 28.573469;
const KSC_LON = -80.051070;

// Convert lat/lon to 3D position on Earth sphere
const phi = (90 - KSC_LAT) * (Math.PI / 180);
const theta = (KSC_LON + 180) * (Math.PI / 180);
const altitude = 0; // km above surface (so it's visible)

const x = -(EARTH_RADIUS + altitude) * Math.sin(phi) * Math.cos(theta);
const y = (EARTH_RADIUS + altitude) * Math.cos(phi);
const z = (EARTH_RADIUS + altitude) * Math.sin(phi) * Math.sin(theta);

let orionPosition = new THREE.Vector3(x, y, z);
const LAUNCH_DIRECTION = orionPosition.clone().normalize();
const TRANSLUNAR_DIRECTION = new THREE.Vector3(0.9, 0.24, 0.16).normalize();
const LUNAR_FLYBY_DIRECTION = new THREE.Vector3(0.98, 0.18, -0.1).normalize();
const RETURN_DIRECTION = new THREE.Vector3(0.56, -0.28, 0.36).normalize();
const SPLASHDOWN_DIRECTION = latLonToVector3(18.5, -145.0, 1).normalize();
let activeViewId = 'earth';

// Camera animation state
let cameraAnimation = {
    active: false,
    startPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    activateOrbitOnComplete: false,
    progress: 0,
    duration: 2000 // 2 seconds
};

function latLonToVector3(lat, lon, radius = EARTH_RADIUS) {
    const latPhi = (90 - lat) * (Math.PI / 180);
    const lonTheta = (lon + 180) * (Math.PI / 180);

    return new THREE.Vector3(
        -(radius) * Math.sin(latPhi) * Math.cos(lonTheta),
        (radius) * Math.cos(latPhi),
        (radius) * Math.sin(latPhi) * Math.sin(lonTheta)
    );
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    applyOrionPreviewUiState();
    initializeDistanceCounterState();
    console.log('🚀 Artemis Tracker initializing...');
    
    initializeScene();
    initializeCountdown();
    initializeViewControls();
    initializeTelemetry();
    initializeLightbox();
    initializeCrewBios();
    initializeTrajectory();
  
  // Move ADC box below hero scene on mobile
function repositionADCForMobile() {
    if (window.innerWidth > 768) return;

    const countdownDisplay = document.querySelector('.countdown-display');
    const simpleDepiction = document.querySelector('.simple-depiction');

    if (!countdownDisplay || !simpleDepiction) return;

    // Move it to just before the trajectory/timeline section
    simpleDepiction.parentNode.insertBefore(countdownDisplay, simpleDepiction);

    // Style it for this new position
    countdownDisplay.style.margin = '16px auto 0';
    countdownDisplay.style.width = 'calc(100% - 24px)';
    countdownDisplay.style.maxWidth = '680px';
    countdownDisplay.style.boxSizing = 'border-box';
    countdownDisplay.style.borderRadius = '0';
    countdownDisplay.style.borderLeft = 'none';
    countdownDisplay.style.borderRight = 'none';
    countdownDisplay.style.display = 'block';
    countdownDisplay.style.textAlign = 'center';
    countdownDisplay.style.left = 'auto';
    countdownDisplay.style.right = 'auto';
    countdownDisplay.style.transform = 'none';
}

repositionADCForMobile();
    
    console.log('✓ Artemis Tracker initialized successfully');
});

/**
 * Initialize Three.js Scene
 */
function initializeScene() {
    const container = document.getElementById('earth-container');
    if (!container) return;
    
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05080f);
    
    // Camera setup
    camera = new THREE.PerspectiveCamera(
        45,
        container.clientWidth / container.clientHeight,
        1,
        1000000
    );
    camera.position.set(0, 0, 25000);
    camera.lookAt(0, 0, 0);
    
    // Renderer setup with enhanced quality
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    // Enhanced tone mapping for cinematic look
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputEncoding = THREE.sRGBEncoding;
    
    container.appendChild(renderer.domElement);
    initializeDemoOrbitControls();
    
    // Lighting setup
    setupLighting();
    
    // Create celestial bodies
    createStarfield();
    createEarth();
    createMoon();
    createOrion();
  // commented out- createLaunchMarker();//
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize, false);
    
    // Start animation loop
    animate();
}

/**
 * Setup Scene Lighting
 */
function setupLighting() {
    // Sun (directional light)
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
    sunLight.position.set(100000, 25000, 100000);
    scene.add(sunLight);
    
    // Ambient light (space illumination)
    const ambientLight = new THREE.AmbientLight(0x1f2a38, 0.22);
    scene.add(ambientLight);
    
    // Hemisphere light for atmospheric scattering effect
    const hemisphereLight = new THREE.HemisphereLight(0x6ea8ff, 0x111827, 0.7);
    scene.add(hemisphereLight);

    // Cool fill light so Orion reads clearly against the dark background
    const fillLight = new THREE.DirectionalLight(0x8fb7ff, 0.85);
    fillLight.position.set(-80000, 20000, 35000);
    scene.add(fillLight);

    // Warm rim light for a more cinematic silhouette
    const rimLight = new THREE.DirectionalLight(0xffd4a3, 0.55);
    rimLight.position.set(25000, -15000, -90000);
    scene.add(rimLight);
}

function createEnhancedOrionMaterial(material, meshName) {
    const enhanced = (material && typeof material.clone === 'function')
        ? material.clone()
        : new THREE.MeshStandardMaterial();
    const name = (meshName || '').toLowerCase();
    const hasTexture = Boolean(enhanced.map || enhanced.emissiveMap || enhanced.normalMap || enhanced.roughnessMap || enhanced.metalnessMap);
    const isSolarArray = /solar|panel|array/.test(name);
    const isWindow = /window|glass|visor/.test(name);
    const isThruster = /engine|thruster|nozzle|rcs/.test(name);
    const isHeatShield = /shield|ablator|heat/.test(name);
    const color = enhanced.color ? enhanced.color.clone() : null;
    const looksPlainWhite = color && color.r > 0.88 && color.g > 0.88 && color.b > 0.88;

    if (color) {
        if (isSolarArray) {
            color.setHex(0x223a5e);
        } else if (isWindow) {
            color.setHex(0x101b2d);
        } else if (isThruster) {
            color.setHex(0x7c848f);
        } else if (isHeatShield) {
            color.setHex(0x7a5c49);
        } else if (!hasTexture || looksPlainWhite) {
            color.setHex(0xd8d2ca);
        } else {
            color.offsetHSL(0.0, -0.04, -0.03);
        }

        enhanced.color.copy(color);
    }

    if ('roughness' in enhanced) {
        enhanced.roughness = isSolarArray ? 0.35 : isThruster ? 0.45 : isHeatShield ? 0.88 : 0.62;
    }

    if ('metalness' in enhanced) {
        enhanced.metalness = isSolarArray ? 0.55 : isThruster ? 0.8 : 0.22;
    }

    if ('envMapIntensity' in enhanced) {
        enhanced.envMapIntensity = isSolarArray ? 1.05 : 0.8;
    }

    if ('shininess' in enhanced) {
        enhanced.shininess = isSolarArray ? 95 : isThruster ? 85 : isHeatShield ? 18 : 55;
    }

    if ('reflectivity' in enhanced) {
        enhanced.reflectivity = isSolarArray ? 0.85 : 0.55;
    }

    if ('emissive' in enhanced && enhanced.emissive) {
        if (isSolarArray) {
            enhanced.emissive.setHex(0x081429);
            enhanced.emissiveIntensity = 0.18;
        } else if (isWindow) {
            enhanced.emissive.setHex(0x040914);
            enhanced.emissiveIntensity = 0.12;
        } else {
            enhanced.emissive.setHex(0x111111);
            enhanced.emissiveIntensity = 0.04;
        }
    }

    enhanced.needsUpdate = true;
    return enhanced;
}

function enhanceOrionMaterials(model) {
    model.traverse(function(child) {
        if (!child.isMesh || !child.material) return;

        const originalMaterial = child.material;
        const materials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
        const enhancedMaterials = materials.map(function(material) {
            return createEnhancedOrionMaterial(material, child.name || '');
        });

        child.material = Array.isArray(originalMaterial) ? enhancedMaterials : enhancedMaterials[0];
    });
}

function getTrackerModelPreviewMode() {
    const params = new URLSearchParams(window.location.search);
    const demo = (params.get('demo') || params.get('preview') || '').toLowerCase();

    if (demo === 'orion' || params.get('orion_demo') === '1') {
        return 'orion';
    }

    if (demo === 'sls') {
        return 'sls';
    }

    return null;
}

function isOrionPreviewMode() {
    return TRACKER_PREVIEW_MODE === 'orion';
}

function isPreviewFreeCameraEnabled() {
    const params = new URLSearchParams(window.location.search);
    return isOrionPreviewMode() && params.get('freecam') === '1';
}

function isOrionModelActive(now = getMissionNow()) {
    return TRACKER_PREVIEW_MODE === 'orion' || now >= (LAUNCH_DATE + ORION_MODEL_SWITCH_OFFSET_MS);
}

function shouldEnableOrionPan(viewId = activeViewId, now = getMissionNow()) {
    return viewId === 'spacecraft' && isOrionModelActive(now);
}

function getMissionNow() {
    if (isOrionPreviewMode()) {
        return LAUNCH_DATE + ORION_PREVIEW_MISSION_OFFSET_MS;
    }

    return Date.now();
}

function isDistanceCounterMode(now = getMissionNow()) {
    return now >= LAUNCH_DATE;
}

function getMissionElapsedMs(now = getMissionNow()) {
    return Math.max(0, Math.min(TOTAL_MISSION_DURATION_MS, now - LAUNCH_DATE));
}

function blendDirections(start, end, t) {
    return start.clone().lerp(end, Math.max(0, Math.min(1, t))).normalize();
}

function getDistanceFromEarthKm(now = getMissionNow()) {
    if (now <= LAUNCH_DATE) {
        return 0;
    }

    const elapsed = Math.max(0, Math.min(TOTAL_MISSION_DURATION_MS, now - LAUNCH_DATE));

    for (let i = 0; i < EARTH_DISTANCE_PROFILE.length - 1; i++) {
        const start = EARTH_DISTANCE_PROFILE[i];
        const end = EARTH_DISTANCE_PROFILE[i + 1];

        if (elapsed >= start.timeMs && elapsed <= end.timeMs) {
            const span = end.timeMs - start.timeMs;
            const rawT = span > 0 ? (elapsed - start.timeMs) / span : 0;
            const easedT = rawT * rawT * (3 - 2 * rawT);
            return start.distanceKm + ((end.distanceKm - start.distanceKm) * easedT);
        }
    }

    return EARTH_DISTANCE_PROFILE[EARTH_DISTANCE_PROFILE.length - 1].distanceKm;
}

function getDistanceWidgetConfig() {
    const config = (window.ARTEMIS_DISTANCE_CONFIG && typeof window.ARTEMIS_DISTANCE_CONFIG === 'object')
        ? window.ARTEMIS_DISTANCE_CONFIG
        : {};

    return {
        restUrl: typeof config.restUrl === 'string' ? config.restUrl : DISTANCE_WIDGET_DEFAULTS.restUrl,
        earthRadiusKm: Number.isFinite(Number(config.earthRadiusKm)) ? Number(config.earthRadiusKm) : DISTANCE_WIDGET_DEFAULTS.earthRadiusKm,
        defaultUnits: config.defaultUnits === 'km' ? 'km' : DISTANCE_WIDGET_DEFAULTS.defaultUnits,
        showPeakBadge: config.showPeakBadge !== false,
        showSourceLabel: Boolean(config.showSourceLabel),
        peakScope: config.peakScope === 'mission' ? 'mission' : DISTANCE_WIDGET_DEFAULTS.peakScope,
        apollo13RecordKm: Number.isFinite(Number(config.apollo13RecordKm)) ? Number(config.apollo13RecordKm) : DISTANCE_WIDGET_DEFAULTS.apollo13RecordKm,
        clientRefreshMs: Math.max(2000, Number(config.clientRefreshMs) || DISTANCE_WIDGET_DEFAULTS.clientRefreshMs)
    };
}

function syncDistanceCounterBox(active) {
    const countdownDisplay = document.querySelector('.countdown-display');
    const heroCountdown = document.getElementById('hero-countdown');
    if (!countdownDisplay) {
        return;
    }

    if (active) {
        countdownDisplay.id = 'adc-distance-widget';
        if (heroCountdown) {
            heroCountdown.classList.add('distance-widget-active');
        }
    } else if (countdownDisplay.id === 'adc-distance-widget') {
        countdownDisplay.removeAttribute('id');
        if (heroCountdown) {
            heroCountdown.classList.remove('distance-widget-active');
        }
    }
}

function initializeDistanceCounterState() {
    const config = getDistanceWidgetConfig();
    distanceCounterState.unit = readStoredDistanceUnit(config.defaultUnits);
    distanceCounterState.localPeakKm = readStoredDistancePeakKm();
}

function readStoredDistanceUnit(fallbackUnit) {
    try {
        const stored = window.localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY);
        return stored === 'km' || stored === 'mi' ? stored : fallbackUnit;
    } catch (error) {
        return fallbackUnit;
    }
}

function readStoredDistancePeakKm() {
    try {
        const stored = Number(window.localStorage.getItem(DISTANCE_LOCAL_PEAK_STORAGE_KEY));
        return Number.isFinite(stored) && stored > 0 ? stored : 0;
    } catch (error) {
        return 0;
    }
}

function persistDistanceUnit(unit) {
    try {
        window.localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, unit);
    } catch (error) {
        // Ignore storage issues silently.
    }
}

function persistDistancePeakKm(peakKm) {
    try {
        window.localStorage.setItem(DISTANCE_LOCAL_PEAK_STORAGE_KEY, String(peakKm));
    } catch (error) {
        // Ignore storage issues silently.
    }
}

function getDistanceRateFromEarthKmS(now = getMissionNow()) {
    if (now <= LAUNCH_DATE) {
        return 0;
    }

    const deltaMs = 5000;
    const minTime = LAUNCH_DATE;
    const maxTime = LAUNCH_DATE + TOTAL_MISSION_DURATION_MS;
    const startTime = Math.max(minTime, now - deltaMs);
    const endTime = Math.min(maxTime, now + deltaMs);
    const spanSeconds = (endTime - startTime) / 1000;

    if (spanSeconds <= 0) {
        return 0;
    }

    return (getDistanceFromEarthKm(endTime) - getDistanceFromEarthKm(startTime)) / spanSeconds;
}

function getEstimatedMissionPeakKm(now = getMissionNow()) {
    if (now <= LAUNCH_DATE) {
        return 0;
    }

    const elapsed = getMissionElapsedMs(now);
    let peakKm = getDistanceFromEarthKm(now);

    for (let i = 0; i < EARTH_DISTANCE_PROFILE.length; i++) {
        if (EARTH_DISTANCE_PROFILE[i].timeMs <= elapsed) {
            peakKm = Math.max(peakKm, EARTH_DISTANCE_PROFILE[i].distanceKm);
        }
    }

    return peakKm;
}

function convertDistanceKm(distanceKm, unit) {
    return unit === 'km' ? distanceKm : distanceKm * 0.621371;
}

function formatDistanceValue(value, decimals = 0) {
    return Math.max(0, value).toLocaleString('en-GB', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function getDistanceDecimals(value) {
    if (value >= 1000) {
        return 0;
    }

    if (value >= 100) {
        return 1;
    }

    return 2;
}

function formatDistanceWithUnit(distanceKm, unit) {
    const converted = convertDistanceKm(distanceKm, unit);
    return formatDistanceValue(converted, getDistanceDecimals(converted)) + ' ' + unit.toUpperCase();
}

function formatRateWithUnit(rateKmS, unit) {
    const converted = convertDistanceKm(Math.abs(rateKmS), unit);
    let decimals = 2;

    if (converted >= 100) {
        decimals = 0;
    } else if (converted >= 10) {
        decimals = 1;
    }

    return formatDistanceValue(converted, decimals) + ' ' + unit.toUpperCase() + '/S';
}

function ensureDistanceCounterWidget(heroCountdown) {
    if (!heroCountdown) {
        return null;
    }

    if (!heroCountdown.querySelector('.adc-shell')) {
        heroCountdown.innerHTML = [
            '<div class="adc-shell">',
            '  <div class="adc-main-distance">--</div>',
            '  <div class="adc-meta-row">',
            '    <span class="adc-rate">↑ --</span>',
            '    <span class="adc-source" hidden></span>',
            '    <span class="adc-unit-toggle">',
            '      <button type="button" class="adc-unit-btn" data-unit="km">KM</button>',
            '      <button type="button" class="adc-unit-btn" data-unit="mi">MI</button>',
            '    </span>',
            '  </div>',
            '  <div class="adc-record"></div>',
            '</div>'
        ].join('');

        heroCountdown.querySelectorAll('.adc-unit-btn').forEach(function(button) {
            button.addEventListener('click', function() {
                const unit = button.getAttribute('data-unit');
                if (unit !== 'km' && unit !== 'mi') {
                    return;
                }

                distanceCounterState.unit = unit;
                persistDistanceUnit(unit);
                renderDistanceCounterWidget(heroCountdown);
            });
        });
    }

    return {
        main: heroCountdown.querySelector('.adc-main-distance'),
        rate: heroCountdown.querySelector('.adc-rate'),
        source: heroCountdown.querySelector('.adc-source'),
        record: heroCountdown.querySelector('.adc-record'),
        unitButtons: heroCountdown.querySelectorAll('.adc-unit-btn')
    };
}

function updateDistanceCounterUnitButtons(elements) {
    elements.unitButtons.forEach(function(button) {
        const isActive = button.getAttribute('data-unit') === distanceCounterState.unit;
        button.classList.toggle('is-active', isActive);
    });
}

function shouldUseLiveDistanceApi(now = getMissionNow()) {
    const config = getDistanceWidgetConfig();
    return !isOrionPreviewMode() && isDistanceCounterMode(now) && Boolean(config.restUrl) && typeof window.fetch === 'function';
}

function updateLocalPeakKm(surfaceKm, persist = true) {
    if (!(surfaceKm > distanceCounterState.localPeakKm)) {
        return;
    }

    distanceCounterState.localPeakKm = surfaceKm;
    if (persist) {
        persistDistancePeakKm(surfaceKm);
    }
}

function setServerDistanceSnapshot(data) {
    if (!data || data.pre_launch || !data.cache) {
        return false;
    }

    const config = getDistanceWidgetConfig();
    const rangeCenterKm = Number(data.cache.range_center_km);
    const rangeRateKmS = Number(data.cache.range_rate_km_s);
    const snapshotTimeMs = Date.parse(data.cache.utc || data.server_utc || new Date().toISOString());

    if (!Number.isFinite(rangeCenterKm) || rangeCenterKm <= 0) {
        return false;
    }

    distanceCounterState.serverSnapshot = {
        surfaceKm: Math.max(0, rangeCenterKm - config.earthRadiusKm),
        rateKmS: Number.isFinite(rangeRateKmS) ? rangeRateKmS : 0,
        source: data.cache.source || 'Estimated',
        snapshotTimeMs: Number.isFinite(snapshotTimeMs) ? snapshotTimeMs : Date.now()
    };

    if (Number.isFinite(Number(data.mission_peak_surface_km))) {
        distanceCounterState.missionPeakKm = Number(data.mission_peak_surface_km);
    }

    updateLocalPeakKm(distanceCounterState.serverSnapshot.surfaceKm);
    return true;
}

function fetchDistanceCounterSnapshot(force = false) {
    if (!shouldUseLiveDistanceApi() || (distanceCounterState.fetchPromise && !force)) {
        return distanceCounterState.fetchPromise || Promise.resolve(null);
    }

    const config = getDistanceWidgetConfig();

    distanceCounterState.fetchPromise = fetch(config.restUrl, { credentials: 'same-origin' })
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            setServerDistanceSnapshot(data);
            return data;
        })
        .catch(function(error) {
            console.warn('Distance counter fetch failed', error);
            return null;
        })
        .finally(function() {
            distanceCounterState.fetchPromise = null;
        });

    return distanceCounterState.fetchPromise;
}

function ensureDistanceCounterPolling(now = getMissionNow()) {
    if (!shouldUseLiveDistanceApi(now) || distanceCounterState.fetchIntervalId) {
        return;
    }

    fetchDistanceCounterSnapshot(true);
    distanceCounterState.fetchIntervalId = window.setInterval(function() {
        fetchDistanceCounterSnapshot();
    }, getDistanceWidgetConfig().clientRefreshMs);
}

function getLiveDistanceSnapshot() {
    if (!distanceCounterState.serverSnapshot) {
        return null;
    }

    const snapshotAgeMs = Date.now() - distanceCounterState.serverSnapshot.snapshotTimeMs;
    const sourceName = String(distanceCounterState.serverSnapshot.source || '').toLowerCase();
    const isOfficialSource = sourceName !== '' && sourceName !== 'estimated';
    const maxSnapshotAgeMs = Math.max(getDistanceWidgetConfig().clientRefreshMs * 2, 180000);

    if (!isOfficialSource && snapshotAgeMs > maxSnapshotAgeMs) {
        return null;
    }

    // Keep official telemetry visually stable if refreshes pause:
    // extrapolate modestly, then hold the last believable value instead of
    // snapping all the way back to the rough local estimate.
    const cappedAgeMs = isOfficialSource
        ? Math.min(Math.max(0, snapshotAgeMs), 15 * 60 * 1000)
        : Math.max(0, snapshotAgeMs);
    const elapsedSeconds = cappedAgeMs / 1000;

    return {
        surfaceKm: Math.max(0, distanceCounterState.serverSnapshot.surfaceKm + (distanceCounterState.serverSnapshot.rateKmS * elapsedSeconds)),
        rateKmS: distanceCounterState.serverSnapshot.rateKmS,
        source: distanceCounterState.serverSnapshot.source
    };
}

function getDistanceCounterSnapshot(now = getMissionNow()) {
    if (!isDistanceCounterMode(now)) {
        return null;
    }

    if (isOrionPreviewMode()) {
        return {
            surfaceKm: getDistanceFromEarthKm(now),
            rateKmS: getDistanceRateFromEarthKmS(now),
            source: 'Estimated'
        };
    }

    return getLiveDistanceSnapshot() || {
        surfaceKm: getDistanceFromEarthKm(now),
        rateKmS: getDistanceRateFromEarthKmS(now),
        source: 'Estimated'
    };
}

function getTrackerSurfaceDistanceKm(now = getMissionNow()) {
    const snapshot = getDistanceCounterSnapshot(now);

    if (snapshot && Number.isFinite(snapshot.surfaceKm)) {
        return Math.max(0, snapshot.surfaceKm);
    }

    return getDistanceFromEarthKm(now);
}

function getDisplayPeakDistanceKm(now, surfaceKm) {
    const config = getDistanceWidgetConfig();

    if (isOrionPreviewMode()) {
        return getEstimatedMissionPeakKm(now);
    }

    updateLocalPeakKm(surfaceKm);

    if (config.peakScope === 'mission' && Number.isFinite(distanceCounterState.missionPeakKm)) {
        return Math.max(distanceCounterState.missionPeakKm, distanceCounterState.localPeakKm);
    }

    return distanceCounterState.localPeakKm;
}

function renderDistanceCounterWidget(heroCountdown, now = getMissionNow()) {
    const snapshot = getDistanceCounterSnapshot(now);

    if (!heroCountdown || !snapshot) {
        return;
    }

    const config = getDistanceWidgetConfig();
    const elements = ensureDistanceCounterWidget(heroCountdown);
    const peakKm = getDisplayPeakDistanceKm(now, snapshot.surfaceKm);
    const recordKm = config.apollo13RecordKm;
    const sourceText = isOrionPreviewMode() ? 'DEMO EST.' : String(snapshot.source || 'Estimated').toUpperCase();

    if (!elements) {
        return;
    }

    elements.main.textContent = formatDistanceWithUnit(snapshot.surfaceKm, distanceCounterState.unit);
    elements.rate.textContent = (snapshot.rateKmS >= 0 ? '↑ ' : '↓ ') + formatRateWithUnit(snapshot.rateKmS, distanceCounterState.unit);

    if (config.showSourceLabel) {
        elements.source.hidden = false;
        elements.source.textContent = sourceText;
    } else {
        elements.source.hidden = true;
        elements.source.textContent = '';
    }

    if (config.showPeakBadge) {
        const formattedPeak = formatDistanceWithUnit(peakKm, distanceCounterState.unit);
        const formattedRecord = formatDistanceWithUnit(recordKm, distanceCounterState.unit);

        if (peakKm > recordKm) {
            elements.record.textContent = 'MAX DISTANCE: ' + formattedPeak + ' • HUMAN RECORD';
            elements.record.classList.add('is-record');
        } else if (peakKm > 0) {
            elements.record.textContent = 'MAX DISTANCE: ' + formattedPeak + ' • HUMAN RECORD: ' + formattedRecord;
            elements.record.classList.remove('is-record');
        } else {
            elements.record.textContent = 'HUMAN DISTANCE RECORD: ' + formattedRecord;
            elements.record.classList.remove('is-record');
        }
    } else {
        elements.record.textContent = '';
        elements.record.classList.remove('is-record');
    }

    updateDistanceCounterUnitButtons(elements);
}

function getMissionStatusText(now = getMissionNow()) {
    if (now < LAUNCH_DATE) {
        return 'PRE-LAUNCH • Pad 39B';
    }

    const elapsed = getMissionElapsedMs(now);

    if (elapsed < 2 * 60 * 60 * 1000) {
        return 'ASCENT • T+Launch';
    }

    if (elapsed < 4 * 24 * 60 * 60 * 1000) {
        return 'IN FLIGHT • Translunar Coast';
    }

    if (elapsed < 7 * 24 * 60 * 60 * 1000) {
        return 'LUNAR PASS • Free Return';
    }

    if (elapsed < TOTAL_MISSION_DURATION_MS) {
        return 'RETURNING • Earthbound';
    }

    return 'RECOVERED • Pacific Splashdown';
}

function isTliBurnNoticeActive(now = getMissionNow()) {
    if (LAUNCH_DATE === null || now < LAUNCH_DATE) {
        return false;
    }

    const elapsed = getMissionElapsedMs(now);
    return elapsed >= TLI_BURN_START_MET_MS && elapsed < (TLI_BURN_START_MET_MS + TLI_BURN_NOTICE_WINDOW_MS);
}

function getLiveMissionStatusText(now = getMissionNow()) {
    if (now < LAUNCH_DATE) {
        return 'PRE-LAUNCH â€¢ Pad 39B';
    }

    const elapsed = getMissionElapsedMs(now);

    if (elapsed < 2 * 60 * 60 * 1000) {
        return 'ASCENT â€¢ T+Launch';
    }

    if (elapsed < TLI_BURN_START_MET_MS) {
        return 'EARTH ORBIT â€¢ Pre-TLI';
    }

    if (isTliBurnNoticeActive(now)) {
        return 'TLI BURN â€¢ Active';
    }

    if (elapsed < 4 * 24 * 60 * 60 * 1000) {
        return 'IN FLIGHT â€¢ Translunar Coast';
    }

    if (elapsed < 7 * 24 * 60 * 60 * 1000) {
        return 'LUNAR PASS â€¢ Free Return';
    }

    if (elapsed < TOTAL_MISSION_DURATION_MS) {
        return 'RETURNING â€¢ Earthbound';
    }

    return 'RECOVERED â€¢ Pacific Splashdown';
}

function refreshMissionStatusPill(now = getMissionNow()) {
    const statusPill = document.querySelector('.status-pill');
    if (!statusPill || (!isDistanceCounterMode(now) && !isOrionPreviewMode())) {
        return;
    }

    statusPill.innerHTML = '<span class="live-indicator">LIVE</span> ' + getLiveMissionStatusTextSafe(now);
    statusPill.classList.remove('pre-launch');
}

function getLiveMissionStatusTextSafe(now = getMissionNow()) {
    if (now < LAUNCH_DATE) {
        return 'PRE-LAUNCH - Pad 39B';
    }

    const elapsed = getMissionElapsedMs(now);

    if (elapsed < 2 * 60 * 60 * 1000) {
        return 'ASCENT - T+Launch';
    }

    if (elapsed < TLI_BURN_START_MET_MS) {
        return 'EARTH ORBIT - Pre-TLI';
    }

    if (isTliBurnNoticeActive(now)) {
        return 'TLI BURN - Active';
    }

    if (elapsed < 4 * 24 * 60 * 60 * 1000) {
        return 'IN FLIGHT - Translunar Coast';
    }

    if (elapsed < 7 * 24 * 60 * 60 * 1000) {
        return 'LUNAR PASS - Free Return';
    }

    if (elapsed < TOTAL_MISSION_DURATION_MS) {
        return 'RETURNING - Earthbound';
    }

    return 'RECOVERED - Pacific Splashdown';
}

function getOrionMissionPosition(now = getMissionNow()) {
    if (!isDistanceCounterMode(now)) {
        return LAUNCH_DIRECTION.clone().multiplyScalar(EARTH_RADIUS);
    }

    const elapsed = getMissionElapsedMs(now);
    const radialDistance = EARTH_RADIUS + getTrackerSurfaceDistanceKm(now);
    let direction;

    if (elapsed <= 2 * 60 * 60 * 1000) {
        direction = blendDirections(LAUNCH_DIRECTION, TRANSLUNAR_DIRECTION, elapsed / (2 * 60 * 60 * 1000));
    } else if (elapsed <= 4 * 24 * 60 * 60 * 1000) {
        direction = blendDirections(
            TRANSLUNAR_DIRECTION,
            LUNAR_FLYBY_DIRECTION,
            (elapsed - (2 * 60 * 60 * 1000)) / ((4 * 24 * 60 * 60 * 1000) - (2 * 60 * 60 * 1000))
        );
    } else if (elapsed <= 7 * 24 * 60 * 60 * 1000) {
        direction = blendDirections(
            LUNAR_FLYBY_DIRECTION,
            RETURN_DIRECTION,
            (elapsed - (4 * 24 * 60 * 60 * 1000)) / (3 * 24 * 60 * 60 * 1000)
        );
    } else {
        direction = blendDirections(
            RETURN_DIRECTION,
            SPLASHDOWN_DIRECTION,
            (elapsed - (7 * 24 * 60 * 60 * 1000)) / (3 * 24 * 60 * 60 * 1000)
        );
    }

    return direction.multiplyScalar(radialDistance);
}

function getOrionTravelDirection(now = getMissionNow()) {
    const deltaMs = 60 * 1000;
    const missionStart = LAUNCH_DATE;
    const missionEnd = LAUNCH_DATE + TOTAL_MISSION_DURATION_MS;
    const before = getOrionMissionPosition(Math.max(missionStart, now - deltaMs));
    const after = getOrionMissionPosition(Math.min(missionEnd, now + deltaMs));
    const tangent = after.sub(before);

    if (tangent.lengthSq() < 1e-6) {
        const fallback = getOrionMissionPosition(now).clone().normalize();
        return fallback.lengthSq() > 0 ? fallback : TRANSLUNAR_DIRECTION.clone();
    }

    return tangent.normalize();
}

function getStableTravelUpVector(travelDirection, missionPosition) {
    const radial = missionPosition.clone().normalize();

    if (Math.abs(travelDirection.dot(radial)) < 0.85) {
        return radial;
    }

    const worldUp = new THREE.Vector3(0, 1, 0);
    if (Math.abs(travelDirection.dot(worldUp)) < 0.92) {
        return worldUp;
    }

    return new THREE.Vector3(0, 0, 1);
}

function orientOrionAlongTravel(now = getMissionNow(), missionPosition = orionPosition) {
    if (!orionModel || !orionModel.userData || orionModel.userData.modelKind !== 'orion' || !isDistanceCounterMode(now)) {
        return;
    }

    const noseAxis = (orionModel.userData.noseAxis || new THREE.Vector3(-1, 0, 0)).clone().normalize();
    const travelDirection = getOrionTravelDirection(now);
    const upVector = getStableTravelUpVector(travelDirection, missionPosition);
    const lookMatrix = new THREE.Matrix4().lookAt(
        new THREE.Vector3(0, 0, 0),
        travelDirection,
        upVector
    );
    const lookQuaternion = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);
    const correctionQuaternion = new THREE.Quaternion().setFromUnitVectors(
        noseAxis,
        new THREE.Vector3(0, 0, -1)
    );

    orionModel.quaternion.copy(lookQuaternion.multiply(correctionQuaternion));
}

function syncMissionScenePosition(now = getMissionNow()) {
    const missionPosition = getOrionMissionPosition(now);
    orionPosition.copy(missionPosition);

    if (orionModel) {
        orionModel.position.copy(missionPosition);
        orientOrionAlongTravel(now, missionPosition);
    }

    if (launchMarker) {
        launchMarker.position.copy(missionPosition);
    }
}

function applyOrionPreviewUiState() {
    if (!isDistanceCounterMode() && !isOrionPreviewMode()) {
        return;
    }

    const preLaunchLocation = document.getElementById('pre-launch-location');
    if (preLaunchLocation) {
        preLaunchLocation.style.display = 'none';
    }

    refreshMissionStatusPill();

    syncDistanceCounterBox(true);
}

function initializeDemoOrbitControls() {
    if (typeof THREE.OrbitControls === 'undefined' || controls || !renderer) {
        return;
    }

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enabled = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.enableZoom = true;
    controls.rotateSpeed = 0.75;
    controls.panSpeed = 0.9;
    controls.zoomSpeed = 1.05;
    controls.minDistance = 90;
    controls.maxDistance = 1400;
}

function disableOrbitControls() {
    if (!controls) {
        return;
    }

    controls.enabled = false;
}

function focusCameraOnSpacecraft(targetPosition) {
    const focusTarget = targetPosition.clone ? targetPosition.clone() : new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z);
    const offset = new THREE.Vector3(260, 165, 250);
    camera.position.copy(focusTarget.clone().add(offset));
    camera.lookAt(focusTarget);

    if (shouldEnableOrionPan('spacecraft')) {
        activateOrionPreviewControls(focusTarget);
    } else if (controls) {
        controls.target.copy(focusTarget);
        disableOrbitControls();
    }
}

function activateOrionPreviewControls(targetPosition) {
    if (!shouldEnableOrionPan('spacecraft')) {
        disableOrbitControls();
        return;
    }

    initializeDemoOrbitControls();
    if (!controls) {
        return;
    }

    const focusTarget = targetPosition.clone ? targetPosition.clone() : new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z);
    const currentOffset = camera.position.clone().sub(focusTarget);
    const fallbackOffset = new THREE.Vector3(190, 120, 190);
    const offset = currentOffset.length() > 1 ? currentOffset : fallbackOffset;

    controls.enabled = true;
    controls.target.copy(focusTarget);
    camera.position.copy(focusTarget.clone().add(offset));
    camera.lookAt(focusTarget);
    controls.update();
}

function syncOrbitControlsWithSpacecraft() {
    if (!controls || !controls.enabled || activeViewId !== 'spacecraft') {
        return;
    }

    const orbitDelta = orionPosition.clone().sub(controls.target);
    if (orbitDelta.lengthSq() === 0) {
        return;
    }

    camera.position.add(orbitDelta);
    controls.target.copy(orionPosition);
}

/**
 * Create Starfield Background
 */
function createStarfield() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 10000;
    const positions = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount * 3; i += 3) {
        const radius = 500000 + Math.random() * 200000;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        
        positions[i] = radius * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = radius * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = radius * Math.cos(phi);
    }
    
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const starMaterial = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 200,
        transparent: true,
        opacity: 0.8,
        sizeAttenuation: true
    });
    
    const starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
}

/**
 * Create Photorealistic Earth
 */
function createEarth() {
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);
    
    // Load NASA textures
    const textureLoader = new THREE.TextureLoader();
    
    // Day texture (NASA 8K Blue Marble)
    const dayTexture = textureLoader.load(
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/earth_atmos_2048.jpg'
    );
    
    // Night lights texture
    const nightTexture = textureLoader.load(
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/earth_lights_2048.png'
    );
    
    // Specular map (oceans)
    const specularTexture = textureLoader.load(
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/earth_specular_2048.jpg'
    );
    
    // Custom shader for day/night transition
    const earthMaterial = new THREE.MeshPhongMaterial({
        map: dayTexture,
        emissiveMap: nightTexture,
        emissive: new THREE.Color(0xffff88),
        emissiveIntensity: 0.2,
        specularMap: specularTexture,
        specular: new THREE.Color(0x333333),
        shininess: 10
    });
    
    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);
    
    // Cloud layer
    const cloudGeometry = new THREE.SphereGeometry(EARTH_RADIUS + 20, 128, 128);
    const cloudTexture = textureLoader.load(
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/earth_clouds_1024.png'
    );
    
    const cloudMaterial = new THREE.MeshPhongMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.4,
        depthWrite: false
    });
    
    earthClouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
    scene.add(earthClouds);
    
    // Atmospheric glow
    const glowGeometry = new THREE.SphereGeometry(EARTH_RADIUS + 100, 64, 64);
    const glowMaterial = new THREE.ShaderMaterial({
        uniforms: {
            c: { value: 0.3 },
            p: { value: 4.0 },
            glowColor: { value: new THREE.Color(0x4a9fd8) }
        },
        vertexShader: `
            varying vec3 vNormal;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 glowColor;
            uniform float c;
            uniform float p;
            varying vec3 vNormal;
            void main() {
                float intensity = pow(c - dot(vNormal, vec3(0.0, 0.0, 1.0)), p);
                gl_FragColor = vec4(glowColor, intensity);
            }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
    });
    
    const earthGlow = new THREE.Mesh(glowGeometry, glowMaterial);
    scene.add(earthGlow);
}

/**
 * Create Photorealistic Moon
 */
function createMoon() {
    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 64, 64);
    
    const textureLoader = new THREE.TextureLoader();
    
    // NASA LRO texture
    const moonTexture = textureLoader.load(
        'https://cdn.jsdelivr.net/gh/mrdoob/three.js/examples/textures/planets/moon_1024.jpg'
    );
    
    const moonMaterial = new THREE.MeshPhongMaterial({
        map: moonTexture,
        shininess: 5
    });
    
    moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.position.set(MOON_DISTANCE, 0, 0);
    scene.add(moon);
}

/**
 * Create Orion Spacecraft or SLS Rocket (switches 10 min after launch)
 */
function createOrion() {
    // Check if GLTFLoader is available
    if (typeof THREE.GLTFLoader === 'undefined') {
        console.warn('GLTFLoader not available, using fallback model');
        createOrionFallback();
        return;
    }
    
    const gltfLoader = new THREE.GLTFLoader();
    
    // Launch time from PHP (in milliseconds)
    const launchEpoch = window.ARTEMIS_LAUNCH_EPOCH;
    const switchTime = launchEpoch + (10 * 60 * 1000); // +10 minutes
    const currentTime = getMissionNow();
    const previewMode = TRACKER_PREVIEW_MODE;
    
    // Decide which model to load
    let modelURL, modelName, modelScale, shouldEnhanceMaterials;
    
    if (previewMode === 'sls' || (!previewMode && currentTime < switchTime)) {
        // PRE-LAUNCH or first 10 minutes: Show SLS on pad
        modelURL = 'https://artemistracker.com/wp-content/uploads/sls.glb';
        modelName = 'SLS Rocket';
        modelScale = 200;
        shouldEnhanceMaterials = false; // Keep SLS materials untouched
        console.log('🚀 PRE-LAUNCH: Loading SLS rocket on pad');
    } else {
        // 10+ minutes after launch: Show Orion in space
        modelURL = '/wp-content/uploads/orion.glb';
        modelName = 'Orion Spacecraft';
        modelScale = 0.5;
        shouldEnhanceMaterials = true; // Orion gets selective material tuning
        console.log('🛸 POST-LAUNCH: Loading Orion spacecraft');
    }
    
    console.log('Loading', modelName, 'from:', modelURL);
    
    gltfLoader.load(
        modelURL,
        function (gltf) {
            console.log('✓', modelName, 'loaded successfully');
            const model = gltf.scene;
            
            // Adjust scale and rotation
            model.scale.set(modelScale, modelScale, modelScale);
            model.rotation.x = 0;
            model.rotation.y = 0;
            model.rotation.z = 0;
            
            syncMissionScenePosition();
            model.position.copy(orionPosition);
            
            // =============================================
            // ENHANCE THE MODEL (only Orion, not SLS)
            // =============================================
            if (shouldEnhanceMaterials) {
                enhanceOrionMaterials(model);
                const child = { name: modelName };
                        
                        console.log('🎨 Painted mesh:', child.name || 'unnamed');
                console.log('✅', modelName, 'painted and added to scene');
            } else {
                console.log('✅', modelName, 'added to scene with original textures');
            }
            
            model.userData.modelKind = shouldEnhanceMaterials ? 'orion' : 'sls';
            model.userData.noseAxis = shouldEnhanceMaterials
                ? new THREE.Vector3(0, -1, 0)
                : new THREE.Vector3(0, 1, 0);

            scene.add(model);
            orionModel = model;

            syncMissionScenePosition();

            if (shouldEnhanceMaterials && isDistanceCounterMode()) {
                setActiveViewButton('spacecraft');
                focusCameraOnSpacecraft(orionPosition);
            }
        },
        function (progress) {
            console.log('Loading ' + modelName + ':', (progress.loaded / progress.total * 100).toFixed(0) + '%');
        },
        function (error) {
            console.error('Failed to load ' + modelName + ':', error);
            console.log('Using fallback procedural model');
            createOrionFallback();
        }
    );
}

/**
 * Fallback Procedural Orion Model
 */
function createOrionFallback() {
    const orionGroup = new THREE.Group();
    
    // Crew module (cone)
    const crewGeometry = new THREE.ConeGeometry(20, 30, 32);
    const crewMaterial = new THREE.MeshPhongMaterial({ 
        color: 0xcccccc,
        shininess: 80
    });
    const crewModule = new THREE.Mesh(crewGeometry, crewMaterial);
    crewModule.rotation.x = Math.PI;
    orionGroup.add(crewModule);
    
    // Service module (cylinder)
    const serviceGeometry = new THREE.CylinderGeometry(25, 25, 40, 32);
    const serviceMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x888888,
        shininess: 60
    });
    const serviceModule = new THREE.Mesh(serviceGeometry, serviceMaterial);
    serviceModule.position.y = -35;
    orionGroup.add(serviceModule);
    
    // Solar arrays (2 panels)
    const arrayGeometry = new THREE.BoxGeometry(80, 0.5, 30);
    const arrayMaterial = new THREE.MeshPhongMaterial({ 
        color: 0x1a1a3a,
        emissive: 0x0000ff,
        emissiveIntensity: 0.2,
        shininess: 100
    });
    
    const array1 = new THREE.Mesh(arrayGeometry, arrayMaterial);
    array1.position.set(50, -35, 0);
    orionGroup.add(array1);
    
    const array2 = new THREE.Mesh(arrayGeometry, arrayMaterial);
    array2.position.set(-50, -35, 0);
    orionGroup.add(array2);
    
    // Position at launch pad
    orionGroup.position.copy(orionPosition);
    orionGroup.userData.modelKind = 'orion';
    orionGroup.userData.noseAxis = new THREE.Vector3(0, -1, 0);
    
    scene.add(orionGroup);
    orionModel = orionGroup;
    
    console.log('✓ Fallback Orion model created');
}


/**
 * Create Launch Site Marker (Kennedy Space Center)
 */
function createLaunchMarker() {
    const markerGeometry = new THREE.SphereGeometry(30, 16, 16);
    const markerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff6b35,
        transparent: true,
        opacity: 0.8
    });
    
    launchMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    launchMarker.position.copy(orionPosition);
    scene.add(launchMarker);
    
    // Pulsing animation
    let pulseDirection = 1;
    setInterval(() => {
        if (launchMarker.material.opacity >= 1) pulseDirection = -1;
        if (launchMarker.material.opacity <= 0.3) pulseDirection = 1;
        launchMarker.material.opacity += 0.02 * pulseDirection;
    }, 50);
}

/**
 * Animation Loop
 */
function animate() {
    requestAnimationFrame(animate);
    ensureDistanceCounterPolling();
    syncMissionScenePosition();
    
    // Rotate Earth and clouds
    if (earth) earth.rotation.y += 0.0000;
    if (earthClouds) earthClouds.rotation.y += 0.0000055;
    
    // Rotate Moon
    if (moon) moon.rotation.y += 0.0002;
    
    // Update camera animation if active
    if (cameraAnimation.active) {
        updateCameraAnimation();
    }

    if (controls && controls.enabled && !cameraAnimation.active) {
        syncOrbitControlsWithSpacecraft();
        controls.update();
    }
    
    renderer.render(scene, camera);
}

/**
 * Handle Window Resize
 */
function onWindowResize() {
    const container = document.getElementById('earth-container');
    if (!container) return;
    
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}
/**
 * ===================================
 * MOBILE & ORIENTATION DETECTION
 * ===================================
 */

function isMobileDevice() {
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
}

function isLandscape() {
    return window.innerWidth > window.innerHeight;
}

function getDeviceMode() {
    if (!isMobileDevice()) {
        return 'desktop';
    }
    return isLandscape() ? 'mobile-landscape' : 'mobile-portrait';
}

// ============================================
// CAMERA CONTROLS
// ============================================

/**
 * Initialize View Control Buttons
 */
function setActiveViewButton(viewId) {
    activeViewId = viewId;
    if (viewId !== 'spacecraft') {
        disableOrbitControls();
    }
    document.querySelectorAll('.camera-btn').forEach(button => {
        button.classList.toggle('active', button.dataset.view === viewId);
    });
}

function initializeViewControls() {
    const viewButtons = document.querySelectorAll('.camera-btn');
    
    viewButtons.forEach(button => {
        button.addEventListener('click', function() {
            const viewId = this.dataset.view;
            setActiveViewButton(viewId);
            animateCamera(viewId);
        });
    });
}

/**
 * Animate Camera to Preset View
 */
function animateCamera(viewId) {
    // Store current camera state
    cameraAnimation.startPos.copy(camera.position);
    if (controls) {
        cameraAnimation.startTarget.copy(controls.target);
    } else {
        cameraAnimation.startTarget.set(0, 0, 0);
    }

    disableOrbitControls();
    cameraAnimation.activateOrbitOnComplete = shouldEnableOrionPan(viewId);
    
 // Get device mode
const deviceMode = getDeviceMode();

// Set target camera state based on view AND device
switch(viewId) {
    case 'earth':
        if (deviceMode === 'mobile-portrait') {
            // Mobile portrait - closer, higher angle
            cameraAnimation.endPos.set(0, 5000, 20000);
            cameraAnimation.endTarget.set(0, 0, 0);
        } else if (deviceMode === 'mobile-landscape') {
            // Mobile landscape - slightly closer than desktop
            cameraAnimation.endPos.set(0, 2000, 22000);
            cameraAnimation.endTarget.set(0, 0, 0);
        } else {
            // Desktop - original view
            cameraAnimation.endPos.set(0, 0, 25000);
            cameraAnimation.endTarget.set(0, 0, 0);
        }
        break;
        
    case 'moon':
        if (deviceMode === 'mobile-portrait') {
            // Mobile portrait - closer to moon, higher angle
            cameraAnimation.endPos.set(MOON_DISTANCE - 6000, 4000, 4000);
            cameraAnimation.endTarget.copy(moon.position);
        } else if (deviceMode === 'mobile-landscape') {
            // Mobile landscape
            cameraAnimation.endPos.set(MOON_DISTANCE - 7000, 3500, 3500);
            cameraAnimation.endTarget.copy(moon.position);
        } else {
            // Desktop - original view
            cameraAnimation.endPos.set(MOON_DISTANCE - 8000, 3000, 3000);
            cameraAnimation.endTarget.copy(moon.position);
        }
        break;
        
    case 'spacecraft':
        const offset = 200; // 200 km from Orion
        
        if (deviceMode === 'mobile-portrait') {
            // Mobile portrait - closer, better framing
            const mobileOffset = 150;
            cameraAnimation.endPos.copy(orionPosition).add(new THREE.Vector3(mobileOffset, mobileOffset * 0.8, mobileOffset));
            cameraAnimation.endTarget.copy(orionPosition);
        } else if (deviceMode === 'mobile-landscape') {
            // Mobile landscape
            const mobileOffset = 180;
            cameraAnimation.endPos.copy(orionPosition).add(new THREE.Vector3(mobileOffset, mobileOffset * 0.6, mobileOffset));
            cameraAnimation.endTarget.copy(orionPosition);
        } else {
            // Desktop - original view
            cameraAnimation.endPos.copy(orionPosition).add(new THREE.Vector3(offset, offset, offset));
            cameraAnimation.endTarget.copy(orionPosition);
        }
        break;
        
    case 'wide':
        if (deviceMode === 'mobile-portrait') {
            // Mobile portrait - better framing for tall screens
            cameraAnimation.endPos.set(340000, 340000, 340000);
            cameraAnimation.endTarget.set(MOON_DISTANCE / 2.1, 0, 0);
        } else if (deviceMode === 'mobile-landscape') {
            // Mobile landscape - optimized for wide screens
            cameraAnimation.endPos.set(300000, 300000, 220000);
            cameraAnimation.endTarget.set(MOON_DISTANCE / 2, 0, 0);
        } else {
            // Desktop - original view
            cameraAnimation.endPos.set(200000, 200000, 200000);
            cameraAnimation.endTarget.set(MOON_DISTANCE / 2, 0, 0);
        }
        break;
}

console.log(`📱 Camera set for: ${deviceMode} - View: ${viewId}`);
    
    // Start animation
    cameraAnimation.active = true;
    cameraAnimation.progress = 0;
    cameraAnimation.startTime = Date.now();
}

/**
 * Update Camera Animation (Smooth Interpolation)
 */
function updateCameraAnimation() {
    const elapsed = Date.now() - cameraAnimation.startTime;
    cameraAnimation.progress = Math.min(elapsed / cameraAnimation.duration, 1);
    
    // Easing function (ease-in-out)
    const t = cameraAnimation.progress < 0.5
        ? 2 * cameraAnimation.progress * cameraAnimation.progress
        : 1 - Math.pow(-2 * cameraAnimation.progress + 2, 2) / 2;
    
    // Interpolate position
    camera.position.lerpVectors(
        cameraAnimation.startPos,
        cameraAnimation.endPos,
        t
    );
    
    // Interpolate look-at target
    const currentTarget = new THREE.Vector3().lerpVectors(
        cameraAnimation.startTarget,
        cameraAnimation.endTarget,
        t
    );
    camera.lookAt(currentTarget);

    if (controls) {
        controls.target.copy(currentTarget);
    }

    if (controls && controls.enabled) {
        controls.update();
    }
    
    // End animation when complete
    if (cameraAnimation.progress >= 1) {
        cameraAnimation.active = false;
        if (cameraAnimation.activateOrbitOnComplete) {
            activateOrionPreviewControls(orionPosition);
        } else {
            disableOrbitControls();
        }
        cameraAnimation.activateOrbitOnComplete = false;
    }
}

// ============================================
// COUNTDOWN TIMER
// ============================================

function initializeCountdown() {
    const targetDate = LAUNCH_DATE;
    const isNET = (typeof window.ARTEMIS_IS_NET === 'boolean') ? window.ARTEMIS_IS_NET : true;

    // Update label first, before any early returns
    const label = document.getElementById('hero-countdown-label');

    function updateCountdown() {
        const now = getMissionNow();
        const distance = targetDate - now;

        const heroCountdown = document.getElementById('hero-countdown');

        if (!heroCountdown) return;

        if (isDistanceCounterMode(now) || window.ARTEMIS_INITIAL_COUNTDOWN === 'ADC_ACTIVE') {
            syncDistanceCounterBox(true);
            ensureDistanceCounterPolling(now);
            if (label) label.textContent = 'Distance from Earth';
            renderDistanceCounterWidget(heroCountdown, now);
            makeADCDraggable();
            return;
        }

        syncDistanceCounterBox(false);

        if (distance < 0) {
            heroCountdown.textContent = 'LAUNCHED';
            if (label) label.textContent = 'Distance from Earth';
            return;
        }

        // Pre-launch label
        if (label) {
            label.textContent = isNET ? 'Launch Window Opens' : 'Launch in T-Minus';
        }

        const days    = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours   = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        const prefix    = isNET ? 'NET ' : '';
        const formatted = `${prefix}${days}d ${hours}h ${minutes}m ${seconds}s`;

        heroCountdown.textContent = formatted;
    }

    updateCountdown();
    setInterval(updateCountdown, 100);
}

// ============================================
// TELEMETRY UPDATES
// ============================================

/**
 * Initialize Telemetry Display
 */
function initializeTelemetry() {
    updateTelemetry();
    setInterval(updateTelemetry, 2000); // Update every 2 seconds
}

/**
 * Update Telemetry Values
 */
function updateTelemetry() {
    // Pre-launch: static values
    // Post-launch: will calculate from position
    refreshMissionStatusPill(getMissionNow());
    
    const altitude = 0; // km (on pad)
    const velocity = 0; // km/s (stationary)
    const moonDist = MOON_DISTANCE; // km
    
    // Update simple depiction values
    const altElement = document.getElementById('simple-altitude');
    const velElement = document.getElementById('simple-velocity');
    const moonElement = document.getElementById('simple-moon-dist');
    
    if (altElement) altElement.textContent = altitude.toFixed(0) + ' km';
    if (velElement) velElement.textContent = velocity.toFixed(2) + ' km/s';
    if (moonElement) moonElement.textContent = moonDist.toLocaleString() + ' km';
}

// ============================================
// INTERACTIVE TRAJECTORY
// ============================================

/**
 * Initialize Interactive Trajectory System
 */
function initializeTrajectory() {
    const stage = document.getElementById('trajectory-stage');
    const overlay = document.getElementById('trajectory-overlay');
    const masterPath = document.getElementById('traj-master');
    const waypointsGroup = document.getElementById('mission-waypoints');


    const slider = document.getElementById('mission-slider');
    const currentMarker = document.getElementById('current-marker');
    const phaseEl = document.getElementById('current-phase');
    const timeEl = document.getElementById('current-time');

    const detailPanel = document.getElementById('waypoint-detail');
    const detailTitle = document.getElementById('detail-title');
    const detailTime = document.getElementById('detail-time');
    const detailDesc = document.getElementById('detail-description');
    const detailClose = document.querySelector('.detail-close');

    const ghostDot = document.getElementById('ghost-dot');
    const orionDot = document.getElementById('orion-dot');
    const orionLabel = document.getElementById('orion-label');

    if (!stage || !overlay || !masterPath || !waypointsGroup || !slider) return;

    const totalLen = masterPath.getTotalLength();

    // Live mission timing
    const LAUNCH_EPOCH = (typeof window.ARTEMIS_LAUNCH_EPOCH === "number" ? window.ARTEMIS_LAUNCH_EPOCH : null);
    const MISSION_DURATION_MS = (typeof window.ARTEMIS_MISSION_DURATION_MS === "number" ? window.ARTEMIS_MISSION_DURATION_MS : 10 * 24 * 60 * 60 * 1000);

    function getLiveProgressPercent() {
        if (LAUNCH_EPOCH === null) return 0;
        const now = getMissionNow();
        if (now < LAUNCH_EPOCH) return 0;
        const elapsed = now - LAUNCH_EPOCH;
        const pct = (elapsed / MISSION_DURATION_MS) * 100;
        return Math.max(0, Math.min(100, pct));
    }

    // --- WAYPOINTS: percent = slider UI position (evenly spaced) ---
    const WAYPOINTS = [
        {
            id: 'launch',
            title: 'Launch',
            time: 'T+0',
            description: 'Launch from Earth — mission begins.',
            percent: 0,  // Slider UI position
            x: 505,
            y: 593,
            isHollow: true
        },
        {
            id: 'leo',
            title: 'Earth Orbit',
            time: 'T+1h',
            description: 'Parking orbit and systems checkout.',
            percent: 20,  // Slider UI position
            x: 739,
            y: 417
        },
        {
            id: 'tli',
            title: 'TLI Burn',
            time: 'T+24h',
            description: 'Trans-Lunar Injection burn — heading to the Moon.',
            percent: 40,  // Slider UI position
            x: 498,
            y: 813
        },
        {
            id: 'flyby',
            title: 'Lunar Flyby',
            time: 'T+4d',
            description: 'Closest approach — loop around the Moon.',
            percent: 60,  // Slider UI position
            x: 1842,
            y: 167
        },
        {
            id: 'return',
            title: 'Return Leg',
            time: 'T+7d',
            description: 'On the way back to Earth.',
            percent: 80,  // Slider UI position
            x: 1141,
            y: 228
        },
        {
            id: 'splash',
            title: 'Splashdown',
            time: 'T+10d',
            description: 'Re-entry and splashdown — mission complete.',
            percent: 100,  // Slider UI position
            x: 509,
            y: 360,
            isHollow: true
        }
    ];

    // --- Derive pathPercent from x/y automatically ---
    function percentForXY(x, y) {
        const STEPS = 2500;
        let bestP = 0;
        let bestD = Infinity;
        for (let i = 0; i <= STEPS; i++) {
            const t = i / STEPS;
            const pt = masterPath.getPointAtLength(totalLen * t);
            const dx = pt.x - x;
            const dy = pt.y - y;
            const d = (dx * dx) + (dy * dy);
            if (d < bestD) {
                bestD = d;
                bestP = t * 100;
            }
        }
        return bestP;
    }

    WAYPOINTS.forEach(wp => {
        wp.pathPercent = percentForXY(wp.x, wp.y);
    });

    // Force exact ends
    WAYPOINTS[0].pathPercent = 0;
    WAYPOINTS[WAYPOINTS.length - 1].pathPercent = 100;

    console.log('✓ Waypoints calculated:', WAYPOINTS.map(wp => 
        `${wp.id}: slider=${wp.percent}% path=${wp.pathPercent.toFixed(1)}%`
    ));

    // --- Helpers ---
    function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

    function pointAtPercent(percent) {
        const t = clamp(percent, 0, 100) / 100;
        return masterPath.getPointAtLength(totalLen * t);
    }

    function applyLiveTimelineMarkerBias(sliderPercent, now = getMissionNow()) {
        const elapsed = getMissionElapsedMs(now);
        const tliWaypoint = WAYPOINTS.find(wp => wp.id === 'tli');
        if (!tliWaypoint) {
            return sliderPercent;
        }

        // Keep the live marker just beyond TLI during the immediate burn / departure window.
        if (elapsed >= TLI_BURN_START_MET_MS && elapsed < (TLI_BURN_START_MET_MS + (2 * 60 * 60 * 1000))) {
            return Math.max(sliderPercent, tliWaypoint.percent + 0.35);
        }

        return sliderPercent;
    }

    function setMarkerPosition(el, p) {
        if (!el) return;
        const tag = (el.tagName || '').toLowerCase();

        if (tag === 'image') {
            const w = parseFloat(el.getAttribute('width') || '0');
            const h = parseFloat(el.getAttribute('height') || '0');
            el.setAttribute('x', String(p.x - (w / 2)));
            el.setAttribute('y', String(p.y - (h / 2)));
            return;
        }

        el.setAttribute('cx', String(p.x));
        el.setAttribute('cy', String(p.y));
    }

    function setLabelPosition(p) {
        if (!orionLabel) return;
        orionLabel.setAttribute('x', p.x + 14);
        orionLabel.setAttribute('y', p.y - 14);
    }

// --- Build interactive waypoints (CLICK ONLY - NO HOVER) ---
waypointsGroup.innerHTML = '';
WAYPOINTS.forEach(wp => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'waypoint');
    g.setAttribute('data-waypoint', wp.id);
    g.setAttribute('transform', `translate(${wp.x} ${wp.y})`);

    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hit.setAttribute('r', '45');
    hit.setAttribute('fill', 'transparent');
    hit.style.cursor = 'pointer';

    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('class', 'waypoint-ring');
    ring.setAttribute('r', wp.isHollow ? '14' : '12');
    ring.setAttribute('fill', wp.isHollow ? 'none' : 'rgba(0,212,255,0.2)');
    ring.setAttribute('stroke', '#00d4ff');
    ring.setAttribute('stroke-width', '2.5');
    ring.setAttribute('opacity', '0.6');

    g.appendChild(hit);
    g.appendChild(ring);

    // ONLY click - NO hover events at all
    g.addEventListener('click', () => {
        slider.value = String(wp.percent);
        handleSliderInput();
        openDetail(wp);
    });

    waypointsGroup.appendChild(g);
});

// Remove the hover style injection entirely
// DELETE or comment out this block:
/*
if (!document.getElementById('wp-hover-style')) {
    const style = document.createElement('style');
    style.id = 'wp-hover-style';
    style.textContent = `
      .trajectory-overlay .waypoint:hover .waypoint-ring { 
          opacity: 1 !important; 
          r: 16;
          transition: all 0.2s ease;
      }
    `;
    document.head.appendChild(style);
}
*/

    function openDetail(wp) {
        if (!detailPanel) return;
        detailTitle.textContent = wp.title;
        detailTime.textContent = wp.time;
        detailDesc.textContent = wp.description;
        detailPanel.style.display = 'block';
    }

    function closeDetail() {
        if (!detailPanel) return;
        detailPanel.style.display = 'none';
    }

    function updateReadout(sliderPercent) {
        // Find the active phase based on slider percent
        let active = WAYPOINTS[0];
        for (const wp of WAYPOINTS) {
            if (sliderPercent >= wp.percent) active = wp;
        }
        if (phaseEl) phaseEl.textContent = active.title;
        if (timeEl) timeEl.textContent = active.time;
    }

    function setCurrentMarker(percent) {
        if (!currentMarker) return;
        currentMarker.style.left = `${clamp(percent, 0, 100)}%`;
    }

    // --- Convert slider percent (0-100) to path percent ---
    function sliderPercentToPathPercent(sliderPercent) {
        // Find which two waypoints bracket this slider position
        let beforeWp = WAYPOINTS[0];
        let afterWp = WAYPOINTS[WAYPOINTS.length - 1];
        
        for (let i = 0; i < WAYPOINTS.length - 1; i++) {
            if (sliderPercent >= WAYPOINTS[i].percent && sliderPercent <= WAYPOINTS[i + 1].percent) {
                beforeWp = WAYPOINTS[i];
                afterWp = WAYPOINTS[i + 1];
                break;
            }
        }
        
        // Interpolate between their pathPercent values
        const range = afterWp.percent - beforeWp.percent;
        const t = range > 0 ? (sliderPercent - beforeWp.percent) / range : 0;
        return beforeWp.pathPercent + t * (afterWp.pathPercent - beforeWp.pathPercent);
    }

    // --- Convert time percent to slider percent for live Orion ---
    function timePercentToSliderPercent(timePercent) {
        // Map mission time (0-100%) to slider positions based on waypoint times
        // Parse waypoint times to get time percentages
        function parseTimeToMs(timeStr) {
            const match = timeStr.match(/T\+(\d+)([dhms]?)/);
            if (!match) return 0;
            
            const value = parseInt(match[1]);
            const unit = match[2] || 'd';
            
            switch(unit) {
                case 's': return value * 1000;
                case 'm': return value * 60 * 1000;
                case 'h': return value * 60 * 60 * 1000;
                case 'd': return value * 24 * 60 * 60 * 1000;
                default: return 0;
            }
        }

        // Calculate time percentages for waypoints
        const waypointsWithTime = WAYPOINTS.map(wp => ({
            ...wp,
            timePercent: (parseTimeToMs(wp.time) / MISSION_DURATION_MS) * 100
        }));

        // Find bracket
        let beforeWp = waypointsWithTime[0];
        let afterWp = waypointsWithTime[waypointsWithTime.length - 1];
        
        for (let i = 0; i < waypointsWithTime.length - 1; i++) {
            if (timePercent >= waypointsWithTime[i].timePercent && timePercent <= waypointsWithTime[i + 1].timePercent) {
                beforeWp = waypointsWithTime[i];
                afterWp = waypointsWithTime[i + 1];
                break;
            }
        }
        
        // Interpolate to get slider percent
        const range = afterWp.timePercent - beforeWp.timePercent;
        const t = range > 0 ? (timePercent - beforeWp.timePercent) / range : 0;
        return beforeWp.percent + t * (afterWp.percent - beforeWp.percent);
    }

    // --- Build interactive waypoints ---
    waypointsGroup.innerHTML = '';
    WAYPOINTS.forEach(wp => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'waypoint');
        g.setAttribute('data-waypoint', wp.id);
        g.setAttribute('transform', `translate(${wp.x} ${wp.y})`);

        const hit = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        hit.setAttribute('r', '45');
        hit.setAttribute('fill', 'transparent');
        hit.style.cursor = 'pointer';

        const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ring.setAttribute('class', 'waypoint-ring');
        ring.setAttribute('r', wp.isHollow ? '14' : '12');
        ring.setAttribute('fill', wp.isHollow ? 'none' : 'rgba(0,212,255,0.2)');
        ring.setAttribute('stroke', '#00d4ff');
        ring.setAttribute('stroke-width', '2.5');
        ring.setAttribute('opacity', '0.0');

        g.appendChild(hit);
        g.appendChild(ring);

        g.addEventListener('click', () => {
            slider.value = String(wp.percent);
            handleSliderInput();
            openDetail(wp);
        });

        waypointsGroup.appendChild(g);
    });

    if (!document.getElementById('wp-hover-style')) {
        const style = document.createElement('style');
        style.id = 'wp-hover-style';
        style.textContent = `
          .trajectory-overlay .waypoint:hover .waypoint-ring { 
              opacity: 1 !important; 
              r: 16;
              transition: all 0.2s ease;
          }
        `;
        document.head.appendChild(style);
    }

    // --- Slider interaction ---
    function handleSliderInput() {
        const sliderPercent = parseFloat(slider.value || '0');
        
        // Convert slider position to actual path position
        const pathPercent = sliderPercentToPathPercent(sliderPercent);
        const p = pointAtPercent(pathPercent);

        if (ghostDot) {
            ghostDot.setAttribute('opacity', '1');
            setMarkerPosition(ghostDot, p);
        }

        updateReadout(sliderPercent);
    }

    slider.addEventListener('input', handleSliderInput);

    // Timeline marker click support
    document.querySelectorAll('.timeline-markers .marker').forEach(m => {
        m.addEventListener('click', () => {
            const wpId = m.getAttribute('data-waypoint');
            if (wpId) {
                const wp = WAYPOINTS.find(w => w.id === wpId);
                if (wp && typeof wp.percent === 'number') {
                    slider.value = String(wp.percent);
                    handleSliderInput();
                    openDetail(wp);
                    return;
                }
            }
            const pos = parseFloat(m.getAttribute('data-position') || '0');
            slider.value = String(pos);
            handleSliderInput();
        });
    });

    if (detailClose) detailClose.addEventListener('click', closeDetail);

    // --- Live Orion marker: TIME-BASED, converted to slider/path ---
    function setOrionProgress(liveTimePercent) {
        const sliderPercent = timePercentToSliderPercent(liveTimePercent);
        const pathPercent = sliderPercentToPathPercent(sliderPercent);
        const markerSliderPercent = applyLiveTimelineMarkerBias(sliderPercent);
        const p = pointAtPercent(pathPercent);
        if (orionDot) setMarkerPosition(orionDot, p);
        setLabelPosition(p);
        setCurrentMarker(markerSliderPercent);

        if (isOrionPreviewMode()) {
            slider.value = String(sliderPercent);
            updateReadout(sliderPercent);
        }
    }

    // Smooth live Orion motion
    let liveCurrent = 0;
    let liveTarget = 0;
    let lastTargetUpdate = 0;

    function refreshLiveTarget() {
        liveTarget = getLiveProgressPercent();
    }

    function tickLive() {
        const now = Date.now();

        if (now - lastTargetUpdate > 2000) {
            refreshLiveTarget();
            lastTargetUpdate = now;
        }

        liveCurrent = liveCurrent + (liveTarget - liveCurrent) * 0.06;
        liveCurrent = clamp(liveCurrent, 0, 100);

        setOrionProgress(liveCurrent);

        requestAnimationFrame(tickLive);
    }

    // Initialize
    handleSliderInput();
    refreshLiveTarget();
    liveCurrent = liveTarget;
    tickLive();
}

// ============================================
// IMAGE LIGHTBOX
// ============================================
/**
 * Initialize Image Lightbox for Thumbnails
 */
function initializeLightbox() {
    const thumbnails = document.querySelectorAll('.stat-thumbnail, .rocket-stack-button');
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxBackdrop = document.querySelector('.lightbox-backdrop');
    
    if (!lightbox) {
        console.log('Lightbox element not found - skipping initialization');
        return;
    }
    
    console.log('✓ Initializing lightbox for', thumbnails.length, 'thumbnails');
    
    // Open lightbox on thumbnail click
    thumbnails.forEach(thumbnail => {
        thumbnail.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation(); // Prevent event bubbling
            
            const imageUrl = this.dataset.image;
            const imageTitle = this.dataset.title || 'Spacecraft Component';
            const imageDescription = this.dataset.description || '';
            
            console.log('Opening lightbox:', imageTitle, 'URL:', imageUrl);
            
            lightboxImage.src = imageUrl;
            lightboxCaption.innerHTML = `<h2>${imageTitle}</h2>${imageDescription}`;
            lightbox.style.display = 'flex';
            
            // Prevent body scroll ONLY when lightbox is open
            document.body.style.overflow = 'hidden';
        });
    });
  
  /**
 * Enable Image Zoom in Lightbox
 */
function enableLightboxZoom() {
    const lightboxImage = document.getElementById('lightbox-image');
    const imageContainer = document.querySelector('.lightbox-image-container');
    
    if (!lightboxImage) return;
    
    lightboxImage.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent closing lightbox
        
        // Toggle zoom
        this.classList.toggle('zoomed');
        
        if (imageContainer) {
            imageContainer.classList.toggle('zoomed');
        }
    });
    
    console.log('✓ Lightbox zoom enabled');
}

// Call this after initializing the lightbox
document.addEventListener('DOMContentLoaded', function() {
    initializeLightbox();
    enableLightboxZoom();
    // ... your other init functions
});
    
    // Close lightbox
    function closeLightbox() {
        lightbox.style.display = 'none';
        // IMPORTANT: Re-enable scrolling when lightbox closes
        document.body.style.overflow = '';
        document.body.style.overflowY = 'auto';
        console.log('Lightbox closed');
    }
    
    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }
    
    if (lightboxBackdrop) {
        lightboxBackdrop.addEventListener('click', closeLightbox);
    }
    
    // Close on ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && lightbox.style.display === 'flex') {
            closeLightbox();
        }
    });
}
// ============================================
// CREW BIO MODAL
// ============================================

/**
 * Crew Member Biographies
 */
const crewBios = {
    wiseman: {
        name: "Reid Wiseman",
        role: "Commander",
        photo: "http://artemistracker.com/wp-content/uploads/2026/01/Reid-Wiseman-Commander-scaled.jpg",
        bio: `
            <p><strong>Captain Reid Wiseman, USN</strong> is a naval aviator and NASA astronaut serving as Commander of Artemis II.</p>
            
            <p>Born in Baltimore, Maryland in 1975, Wiseman graduated from the U.S. Naval Academy in 1997 and became a naval aviator in 1999. He flew F/A-18 Hornets and completed two deployments supporting combat operations in Iraq and Afghanistan.</p>
            
            <p>Selected as a NASA astronaut in 2009, Wiseman served as Flight Engineer on <strong>Expedition 40/41</strong> aboard the International Space Station in 2014, logging 165 days in space. During his ISS mission, he performed two spacewalks totaling 12 hours and 58 minutes.</p>
            
            <p>As Artemis II Commander, Wiseman will lead humanity's first crewed lunar mission in over 50 years, overseeing all flight operations and crew activities during the 10-day journey around the Moon.</p>
        `
    },
    glover: {
        name: "Victor Glover",
        role: "Pilot",
        photo: "http://artemistracker.com/wp-content/uploads/2026/01/Victor-Glover-Pilot.jpg",
        bio: `
            <p><strong>Commander Victor J. Glover Jr., USN</strong> is a naval aviator, engineer, and NASA astronaut serving as Pilot of Artemis II.</p>
            
            <p>Born in Pomona, California in 1976, Glover graduated from California Polytechnic State University before earning three master's degrees in flight test engineering, systems engineering, and military operational art and science. He became a naval aviator and test pilot, logging over 3,000 flight hours in more than 40 aircraft.</p>
            
            <p>Selected as a NASA astronaut in 2013, Glover served as Pilot and Flight Engineer on <strong>SpaceX Crew-1</strong>, the first operational crewed flight of SpaceX's Crew Dragon. During his 168-day mission aboard the ISS (2020-2021), he performed four spacewalks totaling 26 hours and 7 minutes.</p>
            
            <p>As Artemis II Pilot, Glover will be the <strong>first person of color to travel to the Moon</strong>, operating Orion's flight systems and serving as second-in-command during this historic mission.</p>
        `
    },
    koch: {
        name: "Christina Koch",
        role: "Mission Specialist 1",
        photo: "http://artemistracker.com/wp-content/uploads/2026/01/Christina-Hammock-Koch-Mission-Specialist.jpg",
        bio: `
            <p><strong>Christina Hammock Koch</strong> is an electrical engineer and NASA astronaut serving as Mission Specialist 1 on Artemis II.</p>
            
            <p>Born in Grand Rapids, Michigan in 1979, Koch earned degrees in electrical engineering and physics from North Carolina State University. Before joining NASA, she worked as an electrical engineer at NASA Goddard Space Flight Center and the U.S. Antarctic Program.</p>
            
            <p>Selected as a NASA astronaut in 2013, Koch served as Flight Engineer on <strong>Expedition 59/60/61</strong> aboard the ISS from March 2019 to February 2020. She set the record for the <strong>longest single spaceflight by a woman</strong> at 328 days, and participated in the first all-female spacewalk with Jessica Meir in October 2019. Koch completed six spacewalks totaling 42 hours and 15 minutes.</p>
            
            <p>As Artemis II Mission Specialist, Koch will be the <strong>first woman to travel to the Moon</strong>, conducting critical mission operations and scientific research during the lunar flyby.</p>
        `
    },
    hansen: {
        name: "Jeremy Hansen",
        role: "Mission Specialist 2",
        photo: "http://artemistracker.com/wp-content/uploads/2026/01/Jeremy-Hansen-Mission-Specialist-scaled.jpg",
        bio: `
            <p><strong>Colonel Jeremy Roger Hansen</strong> is a Royal Canadian Air Force fighter pilot and Canadian Space Agency astronaut serving as Mission Specialist 2 on Artemis II.</p>
            
            <p>Born in London, Ontario in 1976, Hansen graduated from the Royal Military College of Canada with a degree in space science. He became a CF-18 fighter pilot with 4 Wing Cold Lake, Alberta, and served as a Fighter Instructor at NATO Flying Training in Canada.</p>
            
            <p>Selected as a Canadian Space Agency astronaut in 2009, Hansen served as <strong>CAPCOM</strong> (Capsule Communicator) at NASA's Mission Control Center in Houston, communicating with astronauts aboard the International Space Station during critical mission phases. He has been instrumental in astronaut training and served as backup for several ISS missions.</p>
            
            <p>As Artemis II Mission Specialist, Hansen will be the <strong>first Canadian to travel to deep space</strong> and the first Canadian to travel to the Moon, representing Canada's partnership in NASA's Artemis program and operating mission systems alongside his crewmates.</p>
        `
    }
};

/**
 * Initialize Crew Bio Modal
 */
function initializeCrewBios() {
    const crewMembers = document.querySelectorAll('.crew-member');
    const bioModal = document.getElementById('crew-bio-modal');
    const bioClose = document.querySelector('.bio-close');
    const bioBackdrop = document.querySelector('.bio-backdrop');
    
    if (!bioModal) {
        console.log('Crew bio modal not found - skipping initialization');
        return;
    }
    
    console.log('✓ Initializing crew bios for', crewMembers.length, 'crew members');
    
    // Open bio modal on crew member click
    crewMembers.forEach(member => {
        member.addEventListener('click', function() {
            const crewId = this.dataset.crew;
            const crewData = crewBios[crewId];
            
            if (!crewData) {
                console.warn('No bio data found for crew member:', crewId);
                return;
            }
            
            console.log('Opening bio for:', crewData.name);
            
            // Populate modal
            document.getElementById('bio-photo').src = crewData.photo;
            document.getElementById('bio-name').textContent = crewData.name;
            document.getElementById('bio-role').textContent = crewData.role;
            document.getElementById('bio-text').innerHTML = crewData.bio;
            
            // Show modal
            bioModal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
    });
    
    // Close bio modal
    function closeBioModal() {
        bioModal.style.display = 'none';
        document.body.style.overflow = '';
        document.body.style.overflowY = 'auto';
        console.log('Bio modal closed');
    }
    
    if (bioClose) {
        bioClose.addEventListener('click', closeBioModal);
    }
    
    if (bioBackdrop) {
        bioBackdrop.addEventListener('click', closeBioModal);
    }
    
    // Close on ESC key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && bioModal.style.display === 'flex') {
            closeBioModal();
        }
    });
}

// ============================================
// CONSOLE INFO
// ============================================

console.log('%c🚀 ARTEMIS TRACKER ', 'background: #00d4ff; color: #000; font-size: 16px; font-weight: bold; padding: 4px 8px;');
console.log('Launch: February 9, 2026, 04:20 UTC');
console.log('3D Engine: Three.js r150');
console.log('Interactive Timeline: Enabled');
/**
 * Feature Description Toggle
 */
(function() {
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
        const toggleBtn = document.getElementById('feature-toggle-btn');
        const section = document.getElementById('feature-info');
        
        if (toggleBtn && section) {
            toggleBtn.addEventListener('click', function() {
                section.classList.toggle('expanded');
                console.log('Feature section toggled'); // Debug
            });
            
            console.log('Feature toggle initialized'); // Debug
        } else {
            console.error('Feature toggle elements not found!'); // Debug
        }
    });
})();

/**
 * ===================================
 * IMAGE LIGHTBOX HANDLER
 * ===================================
 */
document.addEventListener('DOMContentLoaded', function() {
    const lightbox = document.getElementById('image-lightbox');
    const lightboxImage = document.getElementById('lightbox-image');
    const lightboxCaption = document.getElementById('lightbox-caption');
    const lightboxClose = document.querySelector('.lightbox-close');
    const lightboxBackdrop = document.querySelector('.lightbox-backdrop');

    // Open lightbox for all thumbnails (spacecraft + rocket stack)
    const allThumbnails = document.querySelectorAll('.stat-thumbnail, .rocket-stack-button');
    
    allThumbnails.forEach(function(thumbnail) {
        thumbnail.addEventListener('click', function() {
            const imageUrl = this.getAttribute('data-image');
            const title = this.getAttribute('data-title');
            const description = this.getAttribute('data-description');
            
            lightboxImage.src = imageUrl;
            lightboxCaption.innerHTML = '<h2>' + title + '</h2>' + description;
            lightbox.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        });
    });

    // Close lightbox
    function closeLightbox() {
        lightbox.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }
    
    if (lightboxBackdrop) {
        lightboxBackdrop.addEventListener('click', closeLightbox);
    }

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && lightbox.style.display === 'flex') {
            closeLightbox();
        }
    });
});

/**
 * ===================================
 * CREW BIO MODAL HANDLER
 * ===================================
 */
document.addEventListener('DOMContentLoaded', function() {
    const bioModal = document.getElementById('crew-bio-modal');
    const bioClose = document.querySelector('.bio-close');
    const bioBackdrop = document.querySelector('.bio-backdrop');
    const bioPhoto = document.getElementById('bio-photo');
    const bioName = document.getElementById('bio-name');
    const bioRole = document.getElementById('bio-role');
    const bioText = document.getElementById('bio-text');

    // Crew bio data
    const crewData = {
        wiseman: {
            name: 'Reid Wiseman',
            role: 'Commander',
            photo: 'http://artemistracker.com/wp-content/uploads/2026/01/Reid-Wiseman-Commander-scaled.jpg',
            bio: '<p>Captain Reid Wiseman, U.S. Navy, is an accomplished naval aviator and NASA astronaut selected in 2009. He previously served as Flight Engineer aboard the International Space Station during Expedition 40/41 in 2014, logging 165 days in space.</p><p>As Artemis II Commander, Wiseman will be responsible for all phases of flight, crew safety, and mission success. His experience and leadership make him ideal for this historic mission.</p><p><strong>Education:</strong> B.S. Computer Science, Johns Hopkins University; M.S. Systems Engineering, Johns Hopkins University</p><p><strong>Flight Experience:</strong> Over 1,800 flight hours in 31 aircraft types</p>'
        },
        glover: {
            name: 'Victor Glover',
            role: 'Pilot',
            photo: 'http://artemistracker.com/wp-content/uploads/2026/01/Victor-Glover-Pilot.jpg',
            bio: '<p>Commander Victor Glover, U.S. Navy, is a naval aviator, engineer, and NASA astronaut. He served as pilot and second-in-command on SpaceX Crew-1, NASA\'s first post-certification crewed mission, spending 168 days aboard the ISS.</p><p>Glover will make history as the first person of color to travel beyond low Earth orbit. As Pilot, he will assist the Commander in spacecraft operations and serve as backup for all mission tasks.</p><p><strong>Education:</strong> B.S. Engineering, Cal Poly; M.S. Flight Test Engineering, Air University; M.S. Systems Engineering, Naval Postgraduate School</p><p><strong>Significance:</strong> First African American to participate in a long-duration ISS mission</p>'
        },
        koch: {
            name: 'Christina Koch',
            role: 'Mission Specialist 1',
            photo: 'http://artemistracker.com/wp-content/uploads/2026/01/Christina-Hammock-Koch-Mission-Specialist.jpg',
            bio: '<p>Christina Hammock Koch is an electrical engineer and NASA astronaut. She holds the record for the longest single spaceflight by a woman (328 days) and participated in the first all-female spacewalk in 2019.</p><p>Koch will make history as the first woman to travel beyond low Earth orbit. As Mission Specialist 1, she will be responsible for spacecraft systems, experiments, and payload operations.</p><p><strong>Education:</strong> B.S. Electrical Engineering, NC State; M.S. Electrical Engineering, NC State</p><p><strong>Experience:</strong> 6 spacewalks totaling 42 hours 15 minutes; 328 days in space</p><p><strong>Significance:</strong> First woman to fly beyond LEO in human history</p>'
        },
        hansen: {
            name: 'Jeremy Hansen',
            role: 'Mission Specialist 2',
            photo: 'http://artemistracker.com/wp-content/uploads/2026/01/Jeremy-Hansen-Mission-Specialist-scaled.jpg',
            bio: '<p>Colonel Jeremy Hansen is a fighter pilot with the Royal Canadian Air Force and astronaut with the Canadian Space Agency. Selected in 2009, he has served as Capcom for numerous ISS missions and in leadership roles for astronaut training.</p><p>Hansen will make history as the first Canadian to travel beyond low Earth orbit. As Mission Specialist 2, he will support all mission operations and serve as crew medical officer.</p><p><strong>Education:</strong> B.Sc. Space Science, Royal Military College; M.Sc. Physics, Royal Military College</p><p><strong>Flight Experience:</strong> CF-18 fighter pilot with over 2,200 flight hours</p><p><strong>Significance:</strong> First Canadian to fly beyond LEO; represents Canada\'s contribution to Artemis</p>'
        }
    };

    // Open crew bio
    const crewMembers = document.querySelectorAll('.crew-member');
    crewMembers.forEach(function(member) {
        member.addEventListener('click', function() {
            const crewId = this.getAttribute('data-crew');
            const crew = crewData[crewId];
            
            if (crew) {
                bioPhoto.src = crew.photo;
                bioName.textContent = crew.name;
                bioRole.textContent = crew.role;
                bioText.innerHTML = crew.bio;
                bioModal.style.display = 'flex';
                document.body.style.overflow = 'hidden';
            }
        });
    });

    // Close bio modal
    function closeBioModal() {
        bioModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }

    if (bioClose) {
        bioClose.addEventListener('click', closeBioModal);
    }
    
    if (bioBackdrop) {
        bioBackdrop.addEventListener('click', closeBioModal);
    }

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && bioModal.style.display === 'flex') {
            closeBioModal();
        }
    });
});

console.log('✅ Popup handlers initialized');

/**
 * ===================================
 * YOUTUBE LIVE STREAM POPUP
 * iPhone Safari + iPhone PWA: OPEN YOUTUBE (no iframe)
 * iPad + Desktop: EMBED IN MODAL
 * ===================================
 */

(function () {
  'use strict';

  window.addEventListener('load', function () {
    console.log('🎬 Initializing YouTube popup...');

    const ua = navigator.userAgent || '';
    const isPhone = /iPhone|Android/i.test(ua) && !/iPad/i.test(ua);

    // ✅ NASA stream video ID (update when NASA changes it)
    const YT_VIDEO_ID = '6RwfNBtepa4';

    const WATCH_URL = 'https://www.youtube.com/live/6RwfNBtepa4?si=v5VYJ3b0n7RzlgB_';
    const EMBED_BASE = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(YT_VIDEO_ID)}`;

    // Create modal HTML
    const modalHTML = `
      <div id="youtube-modal" class="youtube-modal" style="
        display:none; position:fixed; inset:0; z-index:999999;
        align-items:center; justify-content:center;">
        
        <div class="youtube-backdrop" style="
          position:absolute; inset:0; background:rgba(0,0,0,.55);"></div>

        <!-- IMPORTANT: no transform-centering (iPhone hates that with iframes) -->
        <div class="youtube-content" style="
          position:relative;
          width:min(1000px, 94vw);
          height:min(620px, 70vh);
          background:rgba(16,18,22,.92);
          border-radius:16px;
          overflow:hidden;
          border:1px solid rgba(255,255,255,.08);">

          <button class="youtube-close" aria-label="Close video" style="
            position:absolute; right:16px; top:12px; z-index:50;
            width:44px; height:44px; border-radius:12px;
            background:rgba(0,0,0,.35); color:#fff; border:0;
            font-size:26px; line-height:1; cursor:pointer;">&times;</button>

          <div id="youtube-wrapper" class="youtube-wrapper" style="position:absolute; inset:0;">
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('youtube-modal');
    const closeBtn = modal.querySelector('.youtube-close');
    const backdrop = modal.querySelector('.youtube-backdrop');
    const wrapper = document.getElementById('youtube-wrapper');

    const trackerStatusButton = document.querySelector('.status-pill');
    if (!trackerStatusButton) {
      console.warn('⚠️ Tracker status button not found');
      return;
    }

    function openModal(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      if (isPhone) {
        wrapper.innerHTML = '<div style="padding:60px 30px;text-align:center;color:#e0e0e0;"><a href="' + WATCH_URL + '" target="_blank" rel="noopener" style="display:inline-block;padding:16px 40px;background:#00d4ff;color:#0a0e27;border-radius:50px;text-decoration:none;font-weight:700;">🔴 OPEN LIVE STREAM</a></div>';
        return;
      }

      wrapper.innerHTML = '<iframe width="100%" height="100%" src="' + EMBED_BASE + '?autoplay=1&mute=0&controls=1&rel=0&modestbranding=1&playsinline=1" frameborder="0" referrerpolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe>';
    }

    function closeModal() {
      modal.style.display = 'none';
      document.body.style.overflow = '';
      wrapper.innerHTML = '';
    }

    trackerStatusButton.style.cursor = 'pointer';

    // Click + touch support
    trackerStatusButton.addEventListener('click', openModal, { passive: false });
    trackerStatusButton.addEventListener('touchend', openModal, { passive: false });

    closeBtn.addEventListener('click', closeModal);
    closeBtn.addEventListener('touchend', closeModal, { passive: false });

    backdrop.addEventListener('click', closeModal);
    backdrop.addEventListener('touchend', closeModal, { passive: false });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.style.display !== 'none') closeModal();
    });

    console.log('✅ Restored legacy YouTube popup behavior for tracker status button');
  });
})();



/**
 * ===================================
 * ADD LIVE INDICATOR TO PRE-LAUNCH
 * ===================================
 */

(function() {
    'use strict';
    
    window.addEventListener('load', function() {
        const preLaunchPill = document.querySelector('.status-pill.pre-launch');
        
        if (preLaunchPill) {
            // Get current text
            const currentText = preLaunchPill.textContent;
            
            // Add LIVE indicator
            preLaunchPill.innerHTML = `
                <span class="live-indicator">🔴 LIVE</span>
                ${currentText}
            `;
            
            console.log('✅ Added LIVE indicator to PRE-LAUNCH button');
        }
    });
    
})();
// ============================================
// DRAGGABLE ADC WIDGET (DESKTOP ONLY)
// ============================================

function makeADCDraggable() {
    const dragBox = document.querySelector('.countdown-display');
    const heroOverlay = document.querySelector('.hero-overlay');
    if (!dragBox || !heroOverlay) return;

    const storageKey = 'adc-position-v5';
    const defaultOffset = { x: 0, y: 0 };
    const snapHomeThreshold = 56;

    function isDesktopDragEnabled() {
        return window.innerWidth >= 1024 && isDistanceCounterMode();
    }

    function getBaseRect() {
        const previousTransform = dragBox.style.transform;
        dragBox.style.transform = 'translate(0px, 0px)';
        const rect = dragBox.getBoundingClientRect();
        dragBox.style.transform = previousTransform;
        return rect;
    }

    function clampPosition(x, y) {
        const overlayRect = heroOverlay.getBoundingClientRect();
        const baseRect = getBaseRect();
        const controls = document.querySelector('.camera-controls');
        const controlsRect = controls ? controls.getBoundingClientRect() : null;
        const sidePadding = 24;
        const topPadding = 88;
        const bottomPadding = controlsRect ? Math.max(0, controlsRect.top - baseRect.bottom - 20) : 0;

        const minX = overlayRect.left + sidePadding - baseRect.left;
        const maxX = overlayRect.right - sidePadding - baseRect.right;
        const minY = overlayRect.top + topPadding - baseRect.top;
        const maxY = Math.max(0, overlayRect.bottom - bottomPadding - baseRect.bottom);

        return {
            x: Math.min(Math.max(x, minX), maxX),
            y: Math.min(Math.max(y, minY), maxY)
        };
    }

    function applyPosition(x, y) {
        const clamped = clampPosition(x, y);
        dragBox.style.transform = `translate(${Math.round(clamped.x)}px, ${Math.round(clamped.y)}px)`;
        return clamped;
    }

    function maybeSnapToHome(x, y) {
        const home = clampPosition(defaultOffset.x, defaultOffset.y);
        const deltaX = x - home.x;
        const deltaY = y - home.y;
        const distanceFromHome = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY));

        if (distanceFromHome <= snapHomeThreshold) {
            return home;
        }

        return { x: x, y: y };
    }

    function resetForNonDesktop() {
        dragBox.style.transform = '';
        dragBox.style.cursor = '';
        dragBox.classList.remove('adc-drag-ready', 'adc-dragging');
    }

    function readSavedPosition() {
        return localStorage.getItem(storageKey);
    }

    if (dragBox.dataset.adcDraggableBound === '1') {
        if (!isDesktopDragEnabled()) {
            resetForNonDesktop();
            return;
        }

        dragBox.classList.add('adc-drag-ready');
        dragBox.style.cursor = 'grab';
        dragBox.style.touchAction = 'none';
        const saved = readSavedPosition();
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                applyPosition(Number(parsed.x) || 0, Number(parsed.y) || 0);
            } catch (error) {
                console.warn('Unable to restore saved ADC position', error);
            }
        } else {
            applyPosition(defaultOffset.x, defaultOffset.y);
        }
        return;
    }

    dragBox.dataset.adcDraggableBound = '1';

    let isDragging = false;
    let startPointerX = 0;
    let startPointerY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;
    let currentOffsetX = 0;
    let currentOffsetY = 0;

    function restoreSavedPosition() {
        if (!isDesktopDragEnabled()) {
            resetForNonDesktop();
            currentOffsetX = 0;
            currentOffsetY = 0;
            return;
        }

        dragBox.classList.add('adc-drag-ready');
        dragBox.style.cursor = 'grab';
        dragBox.style.touchAction = 'none';

        const saved = readSavedPosition();
        if (!saved) {
            const initial = applyPosition(defaultOffset.x, defaultOffset.y);
            currentOffsetX = initial.x;
            currentOffsetY = initial.y;
            return;
        }

        try {
            const parsed = JSON.parse(saved);
            const restoredX = Number(parsed.x) || 0;
            const restoredY = Number(parsed.y) || 0;

            const restored = applyPosition(restoredX, restoredY);
            currentOffsetX = restored.x;
            currentOffsetY = restored.y;
            localStorage.setItem(storageKey, JSON.stringify({
                x: currentOffsetX,
                y: currentOffsetY
            }));
        } catch (error) {
            console.warn('Unable to restore saved ADC position', error);
            const fallback = applyPosition(defaultOffset.x, defaultOffset.y);
            currentOffsetX = fallback.x;
            currentOffsetY = fallback.y;
        }
    }

    function dragStart(event) {
        if (!isDesktopDragEnabled()) return;
        if ((event.pointerType && event.pointerType !== 'mouse') || (typeof event.button === 'number' && event.button !== 0)) return;
        if (event.target.closest('button, a, input')) return;

        isDragging = true;
        startPointerX = event.clientX;
        startPointerY = event.clientY;
        startOffsetX = currentOffsetX;
        startOffsetY = currentOffsetY;

        dragBox.classList.add('adc-dragging');
        dragBox.style.cursor = 'grabbing';
        event.preventDefault();
    }

    function dragMove(event) {
        if (!isDragging) return;

        const nextX = startOffsetX + (event.clientX - startPointerX);
        const nextY = startOffsetY + (event.clientY - startPointerY);
        const applied = applyPosition(nextX, nextY);
        currentOffsetX = applied.x;
        currentOffsetY = applied.y;
        event.preventDefault();
    }

    function dragEnd() {
        if (!isDragging) return;
        isDragging = false;
        dragBox.classList.remove('adc-dragging');
        dragBox.style.cursor = 'grab';
        const snapped = maybeSnapToHome(currentOffsetX, currentOffsetY);
        const applied = applyPosition(snapped.x, snapped.y);
        currentOffsetX = applied.x;
        currentOffsetY = applied.y;
        localStorage.setItem(storageKey, JSON.stringify({
            x: currentOffsetX,
            y: currentOffsetY
        }));
    }

    dragBox.addEventListener('pointerdown', dragStart);
    window.addEventListener('pointermove', dragMove);
    window.addEventListener('pointerup', dragEnd);
    window.addEventListener('pointercancel', dragEnd);
    window.addEventListener('resize', restoreSavedPosition);

    restoreSavedPosition();
}

// Initialize after ADC appears
setTimeout(makeADCDraggable, 500);

