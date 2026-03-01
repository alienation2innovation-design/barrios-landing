/**
 * ================================================================================
 * NEURAL BRAIN INTEGRATION v1.0
 * ================================================================================
 * Frontend module for Neural RAG Brain cognitive status display
 * 
 * Features:
 * - SSE event handling for cognitive status
 * - Visual indicators for System 1/2 routing
 * - Memory tier display
 * - Reflection token visualization
 * - Circuit breaker status
 * 
 * Author: Barrios A2I | Version: 1.0.0 | January 2026
 * ================================================================================
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

const NEURAL_CONFIG = {
    // API endpoints - Production URLs (Render backend)
    // NOTE: Neural stream endpoint not implemented on GENESIS - SSE disabled
    apiBase: 'https://api.barriosa2i.com/api/neural',
    sseEndpoint: null, // Disabled - /api/neural/stream doesn't exist on GENESIS
    sseEnabled: false,
    
    // UI selectors
    selectors: {
        cognitiveStatus: '#cognitive-status',
        cognitiveMode: '#cognitive-mode',
        reasoningDepth: '#reasoning-depth',
        memoryTier: '#memory-tier',
        reflectionTokens: '#reflection-tokens',
        circuitStatus: '#circuit-status',
        qualityScore: '#quality-score',
        processingPath: '#processing-path'
    },
    
    // Animation durations
    animations: {
        modeTransition: 300,
        tokenFlash: 500,
        pulseInterval: 1000
    },
    
    // Colors (Tesla minimalism meets cyberpunk)
    colors: {
        crystallineTeal: '#00CED1',
        cyan: '#00C2FF',
        gold: '#FFD700',
        success: '#00FF88',
        warning: '#FFB800',
        error: '#FF4444',
        system1: '#00CED1',  // Fast path
        system2: '#FFD700',  // Deep path
        hybrid: '#00C2FF'    // Standard path
    }
};

// =============================================================================
// COGNITIVE STATUS MANAGER
// =============================================================================

class CognitiveStatusManager {
    constructor(options = {}) {
        this.config = { ...NEURAL_CONFIG, ...options };
        this.elements = {};
        this.currentStatus = {
            mode: 'NRC',
            tier: 'simple',
            path: 'fast',
            memoryTier: 'L0',
            reasoningDepth: 0,
            reflectionTokens: [],
            circuitStates: {},
            qualityScore: null
        };
        this.eventSource = null;
        this.isConnected = false;
        
        this.init();
    }
    
    init() {
        this.cacheElements();
        this.createUI();
        this.bindEvents();
        console.log('[NeuralBrain] Cognitive Status Manager initialized');
    }
    
    cacheElements() {
        for (const [key, selector] of Object.entries(this.config.selectors)) {
            this.elements[key] = document.querySelector(selector);
        }
    }
    
    createUI() {
        // Create toggle button first (always visible)
        if (!document.getElementById('neural-brain-toggle')) {
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'neural-brain-toggle';
            toggleBtn.className = 'neural-brain-toggle';
            toggleBtn.innerHTML = `
                <span class="toggle-icon">&#129504;</span>
                <span class="toggle-label">NEURAL</span>
            `;
            toggleBtn.title = 'Toggle Neural Brain Panel';
            document.body.appendChild(toggleBtn);
        }

        // Create cognitive status container if it doesn't exist
        if (!this.elements.cognitiveStatus) {
            const container = document.createElement('div');
            container.id = 'cognitive-status';
            container.className = 'cognitive-status-panel glass-panel collapsed'; // Default collapsed
            container.innerHTML = `
                <div class="cognitive-header">
                    <span class="cognitive-label">NEURAL BRAIN</span>
                    <div class="header-actions">
                        <span class="connection-indicator" id="neural-connection"></span>
                        <button class="panel-close-btn" title="Close panel">&#10005;</button>
                    </div>
                </div>
                
                <div class="cognitive-grid">
                    <!-- Processing Mode -->
                    <div class="cognitive-item">
                        <label>MODE</label>
                        <span id="cognitive-mode" class="cognitive-value mode-nrc">NRC</span>
                    </div>
                    
                    <!-- Processing Path -->
                    <div class="cognitive-item">
                        <label>PATH</label>
                        <span id="processing-path" class="cognitive-value path-fast">
                            <span class="path-icon">⚡</span>
                            <span class="path-label">FAST</span>
                        </span>
                    </div>
                    
                    <!-- Memory Tier -->
                    <div class="cognitive-item">
                        <label>MEMORY</label>
                        <span id="memory-tier" class="cognitive-value">L0</span>
                    </div>
                    
                    <!-- Reasoning Depth -->
                    <div class="cognitive-item">
                        <label>DEPTH</label>
                        <span id="reasoning-depth" class="cognitive-value">0</span>
                    </div>
                </div>
                
                <!-- Reflection Tokens -->
                <div class="reflection-tokens-container">
                    <label>REFLECTION</label>
                    <div id="reflection-tokens" class="reflection-tokens"></div>
                </div>
                
                <!-- Quality Score -->
                <div class="quality-container">
                    <label>QUALITY</label>
                    <div class="quality-bar-container">
                        <div id="quality-score" class="quality-bar" style="width: 0%"></div>
                    </div>
                    <span id="quality-value" class="quality-value">--</span>
                </div>
                
                <!-- Circuit Status -->
                <div class="circuit-status-container">
                    <label>CIRCUITS</label>
                    <div id="circuit-status" class="circuit-indicators"></div>
                </div>
            `;
            
            // Insert into page
            const chatContainer = document.querySelector('.chat-container') || document.body;
            chatContainer.appendChild(container);
            
            this.elements.cognitiveStatus = container;
            this.cacheElements();
        }
        
        this.injectStyles();
    }
    
    injectStyles() {
        if (document.getElementById('neural-brain-styles')) return;
        
        const styles = document.createElement('style');
        styles.id = 'neural-brain-styles';
        styles.textContent = `
            /* Neural Brain Cognitive Status Panel - LEFT side to avoid NEXUS chat overlap */
            .cognitive-status-panel {
                position: fixed;
                top: 50%;
                left: 20px;
                transform: translateY(-50%);
                width: 260px;
                max-height: 80vh;
                overflow-y: auto;
                padding: 16px;
                background: rgba(10, 15, 30, 0.92);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(0, 206, 209, 0.3);
                border-radius: 12px;
                font-family: 'JetBrains Mono', 'Inter', monospace;
                font-size: 12px;
                color: #E0E0E0;
                z-index: 900;
                transition: all 0.3s ease;
                box-shadow:
                    0 0 20px rgba(0, 206, 209, 0.1),
                    inset 0 0 30px rgba(0, 206, 209, 0.02);
            }
            
            .cognitive-status-panel:hover {
                border-color: rgba(0, 206, 209, 0.5);
                box-shadow: 
                    0 0 30px rgba(0, 206, 209, 0.2),
                    inset 0 0 30px rgba(0, 206, 209, 0.05);
            }
            
            .cognitive-status-panel.hidden {
                opacity: 0;
                pointer-events: none;
                transform: translateX(20px);
            }
            
            .cognitive-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 16px;
                padding-bottom: 12px;
                border-bottom: 1px solid rgba(0, 206, 209, 0.2);
            }
            
            .cognitive-label {
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 2px;
                color: ${NEURAL_CONFIG.colors.crystallineTeal};
                text-shadow: 0 0 10px rgba(0, 206, 209, 0.5);
            }
            
            .connection-indicator {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: ${NEURAL_CONFIG.colors.error};
                transition: all 0.3s ease;
            }
            
            .connection-indicator.connected {
                background: ${NEURAL_CONFIG.colors.success};
                box-shadow: 0 0 10px ${NEURAL_CONFIG.colors.success};
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }
            
            .cognitive-grid {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin-bottom: 16px;
            }
            
            .cognitive-item {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            
            .cognitive-item label {
                font-size: 9px;
                font-weight: 500;
                letter-spacing: 1px;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
            }
            
            .cognitive-value {
                font-size: 14px;
                font-weight: 600;
                color: ${NEURAL_CONFIG.colors.crystallineTeal};
                padding: 6px 10px;
                background: rgba(0, 206, 209, 0.1);
                border-radius: 6px;
                border: 1px solid rgba(0, 206, 209, 0.2);
                transition: all 0.3s ease;
            }
            
            /* Mode-specific colors */
            .mode-nrc { color: ${NEURAL_CONFIG.colors.system1}; }
            .mode-nqr { color: ${NEURAL_CONFIG.colors.hybrid}; }
            .mode-ndr { color: ${NEURAL_CONFIG.colors.system2}; }
            .mode-nsc { color: ${NEURAL_CONFIG.colors.gold}; }
            .mode-nad { color: ${NEURAL_CONFIG.colors.error}; }
            
            /* Path indicators */
            .path-fast .path-icon { color: ${NEURAL_CONFIG.colors.system1}; }
            .path-standard .path-icon { color: ${NEURAL_CONFIG.colors.hybrid}; }
            .path-deep .path-icon { color: ${NEURAL_CONFIG.colors.system2}; }
            
            .path-label {
                margin-left: 4px;
            }
            
            /* Reflection Tokens */
            .reflection-tokens-container {
                margin-bottom: 16px;
            }
            
            .reflection-tokens-container label {
                display: block;
                font-size: 9px;
                font-weight: 500;
                letter-spacing: 1px;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
                margin-bottom: 8px;
            }
            
            .reflection-tokens {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                min-height: 28px;
            }
            
            .reflection-token {
                display: inline-flex;
                align-items: center;
                padding: 4px 8px;
                font-size: 10px;
                font-weight: 600;
                border-radius: 4px;
                transition: all 0.3s ease;
            }
            
            .reflection-token.active {
                animation: tokenFlash 0.5s ease;
            }
            
            @keyframes tokenFlash {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            
            .reflection-token.ret {
                background: rgba(0, 206, 209, 0.2);
                color: ${NEURAL_CONFIG.colors.crystallineTeal};
                border: 1px solid rgba(0, 206, 209, 0.3);
            }
            
            .reflection-token.rel {
                background: rgba(0, 194, 255, 0.2);
                color: ${NEURAL_CONFIG.colors.cyan};
                border: 1px solid rgba(0, 194, 255, 0.3);
            }
            
            .reflection-token.sup {
                background: rgba(255, 215, 0, 0.2);
                color: ${NEURAL_CONFIG.colors.gold};
                border: 1px solid rgba(255, 215, 0, 0.3);
            }
            
            .reflection-token.use {
                background: rgba(0, 255, 136, 0.2);
                color: ${NEURAL_CONFIG.colors.success};
                border: 1px solid rgba(0, 255, 136, 0.3);
            }
            
            .reflection-token .token-status {
                margin-left: 4px;
                font-size: 8px;
            }
            
            /* Quality Bar */
            .quality-container {
                margin-bottom: 16px;
            }
            
            .quality-container label {
                display: block;
                font-size: 9px;
                font-weight: 500;
                letter-spacing: 1px;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
                margin-bottom: 8px;
            }
            
            .quality-bar-container {
                height: 6px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
                overflow: hidden;
                margin-bottom: 4px;
            }
            
            .quality-bar {
                height: 100%;
                background: linear-gradient(90deg, 
                    ${NEURAL_CONFIG.colors.error} 0%, 
                    ${NEURAL_CONFIG.colors.warning} 50%, 
                    ${NEURAL_CONFIG.colors.success} 100%);
                border-radius: 3px;
                transition: width 0.5s ease;
            }
            
            .quality-value {
                font-size: 11px;
                font-weight: 600;
                color: ${NEURAL_CONFIG.colors.success};
            }
            
            /* Circuit Status */
            .circuit-status-container label {
                display: block;
                font-size: 9px;
                font-weight: 500;
                letter-spacing: 1px;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
                margin-bottom: 8px;
            }
            
            .circuit-indicators {
                display: flex;
                gap: 8px;
                flex-wrap: wrap;
            }
            
            .circuit-indicator {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 4px 8px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                font-size: 10px;
            }
            
            .circuit-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
            }
            
            .circuit-dot.closed {
                background: ${NEURAL_CONFIG.colors.success};
                box-shadow: 0 0 6px ${NEURAL_CONFIG.colors.success};
            }
            
            .circuit-dot.open {
                background: ${NEURAL_CONFIG.colors.error};
                box-shadow: 0 0 6px ${NEURAL_CONFIG.colors.error};
            }
            
            .circuit-dot.half-open {
                background: ${NEURAL_CONFIG.colors.warning};
                box-shadow: 0 0 6px ${NEURAL_CONFIG.colors.warning};
            }
            
            /* Mobile responsive - hide panel on mobile, show only toggle */
            @media (max-width: 1024px) {
                .cognitive-status-panel {
                    left: 10px;
                    width: 240px;
                    max-height: 60vh;
                    padding: 12px;
                }

                .cognitive-grid {
                    grid-template-columns: repeat(2, 1fr);
                    gap: 8px;
                }
            }

            @media (max-width: 768px) {
                .cognitive-status-panel {
                    top: auto;
                    bottom: 100px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: calc(100% - 32px);
                    max-width: 320px;
                    max-height: 50vh;
                }

                .cognitive-status-panel.collapsed {
                    transform: translateX(-50%) translateY(calc(100% + 120px));
                }

                .cognitive-grid {
                    grid-template-columns: repeat(4, 1fr);
                }
            }
            
            /* Collapsed state - slide out to left */
            .cognitive-status-panel.collapsed {
                transform: translateX(calc(-100% - 40px)) translateY(-50%);
                opacity: 0;
                pointer-events: none;
            }

            /* Neural Brain Toggle Button - LEFT side */
            .neural-brain-toggle {
                position: fixed;
                top: 50%;
                left: 20px;
                transform: translateY(-50%);
                width: 48px;
                height: 48px;
                padding: 0;
                background: rgba(10, 15, 30, 0.9);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(0, 206, 209, 0.4);
                border-radius: 50%;
                cursor: pointer;
                z-index: 899;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                transition: all 0.3s ease;
                box-shadow: 0 0 15px rgba(0, 206, 209, 0.2);
            }

            .neural-brain-toggle:hover {
                border-color: rgba(0, 206, 209, 0.8);
                box-shadow: 0 0 25px rgba(0, 206, 209, 0.4);
                transform: translateY(-50%) scale(1.05);
            }

            .neural-brain-toggle .toggle-icon {
                font-size: 18px;
                line-height: 1;
            }

            .neural-brain-toggle .toggle-label {
                font-size: 7px;
                font-family: 'JetBrains Mono', monospace;
                font-weight: 600;
                letter-spacing: 0.5px;
                color: ${NEURAL_CONFIG.colors.crystallineTeal};
                text-transform: uppercase;
            }

            /* Hide toggle when panel is open */
            .neural-brain-toggle.hidden {
                opacity: 0;
                pointer-events: none;
                transform: scale(0.8);
            }

            /* Panel header close button */
            .header-actions {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .panel-close-btn {
                width: 20px;
                height: 20px;
                padding: 0;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 4px;
                color: rgba(255, 255, 255, 0.5);
                cursor: pointer;
                font-size: 12px;
                line-height: 1;
                transition: all 0.2s ease;
            }

            .panel-close-btn:hover {
                background: rgba(255, 68, 68, 0.2);
                border-color: rgba(255, 68, 68, 0.4);
                color: #FF4444;
            }

            /* Mobile: position toggle at bottom left */
            @media (max-width: 768px) {
                .neural-brain-toggle {
                    top: auto;
                    bottom: 160px;
                    left: 15px;
                    transform: none;
                    width: 44px;
                    height: 44px;
                }

                .neural-brain-toggle:hover {
                    transform: scale(1.05);
                }

                .neural-brain-toggle .toggle-label {
                    display: none;
                }
            }
        `;
        
        document.head.appendChild(styles);
    }
    
    bindEvents() {
        // Toggle button click - show panel
        const toggleBtn = document.getElementById('neural-brain-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.show();
            });
        }

        // Close button click - hide panel
        const closeBtn = this.elements.cognitiveStatus?.querySelector('.panel-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hide();
            });
        }
    }
    
    // =========================================================================
    // SSE CONNECTION
    // =========================================================================
    
    connect(sessionId) {
        // Skip SSE connection if disabled or endpoint not configured
        if (!this.config.sseEnabled || !this.config.sseEndpoint) {
            console.log('[NeuralBrain] SSE disabled - endpoint not available');
            this.isConnected = false;
            this.updateConnectionStatus(false);
            return;
        }

        if (this.eventSource) {
            this.eventSource.close();
        }

        const url = `${this.config.sseEndpoint}?session_id=${sessionId}`;
        this.eventSource = new EventSource(url);

        this.eventSource.onopen = () => {
            this.isConnected = true;
            this.updateConnectionStatus(true);
            console.log('[NeuralBrain] SSE connected');
        };

        this.eventSource.onerror = (error) => {
            this.isConnected = false;
            this.updateConnectionStatus(false);
            console.error('[NeuralBrain] SSE error:', error);
        };

        // Register event handlers
        this.registerEventHandlers();
    }
    
    disconnect() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.isConnected = false;
        this.updateConnectionStatus(false);
    }
    
    registerEventHandlers() {
        if (!this.eventSource) return;
        
        // Complexity classification
        this.eventSource.addEventListener('neural:complexity', (event) => {
            const data = JSON.parse(event.data);
            this.handleComplexityEvent(data);
        });
        
        // Retrieval evaluation (CRAG)
        this.eventSource.addEventListener('neural:retrieval', (event) => {
            const data = JSON.parse(event.data);
            this.handleRetrievalEvent(data);
        });
        
        // Reflection tokens
        this.eventSource.addEventListener('neural:reflection', (event) => {
            const data = JSON.parse(event.data);
            this.handleReflectionEvent(data);
        });
        
        // Memory access
        this.eventSource.addEventListener('neural:memory', (event) => {
            const data = JSON.parse(event.data);
            this.handleMemoryEvent(data);
        });
        
        // Reasoning step (PRM)
        this.eventSource.addEventListener('neural:reasoning', (event) => {
            const data = JSON.parse(event.data);
            this.handleReasoningEvent(data);
        });
        
        // Circuit breaker
        this.eventSource.addEventListener('neural:circuit', (event) => {
            const data = JSON.parse(event.data);
            this.handleCircuitEvent(data);
        });
        
        // Quality gateway
        this.eventSource.addEventListener('neural:quality', (event) => {
            const data = JSON.parse(event.data);
            this.handleQualityEvent(data);
        });
    }
    
    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================
    
    handleComplexityEvent(data) {
        const { tier, confidence, path, features } = data;
        
        this.currentStatus.tier = tier;
        this.currentStatus.path = path;
        
        // Update mode based on path
        const modeMap = {
            'fast': 'NRC',
            'standard': 'NQR',
            'deep': 'NDR'
        };
        this.currentStatus.mode = modeMap[path] || 'NRC';
        
        this.updateModeDisplay();
        this.updatePathDisplay();
        
        console.log('[NeuralBrain] Complexity:', { tier, path, confidence });
    }
    
    handleRetrievalEvent(data) {
        const { action, avg_relevance, confidence, sub_queries } = data;
        
        // Show CRAG action in reflection tokens
        if (action === 'decompose' && sub_queries) {
            this.addReflectionToken('RET', true, `Decomposed: ${sub_queries.length} sub-queries`);
        } else if (action === 'websearch') {
            this.addReflectionToken('RET', false, 'Web search fallback');
        } else {
            this.addReflectionToken('RET', true, `Relevance: ${(avg_relevance * 100).toFixed(0)}%`);
        }
        
        console.log('[NeuralBrain] Retrieval:', { action, avg_relevance });
    }
    
    handleReflectionEvent(data) {
        const { token, decision, reason } = data;
        this.addReflectionToken(token.replace(/[\[\]]/g, ''), decision, reason);
    }
    
    handleMemoryEvent(data) {
        const { tier, traces_retrieved, cache_hit } = data;
        
        this.currentStatus.memoryTier = tier;
        this.updateMemoryDisplay();
        
        if (cache_hit) {
            this.flashElement(this.elements.memoryTier, 'cache-hit');
        }
        
        console.log('[NeuralBrain] Memory:', { tier, traces_retrieved, cache_hit });
    }
    
    handleReasoningEvent(data) {
        const { step, score, quality } = data;
        
        this.currentStatus.reasoningDepth = step + 1;
        this.updateReasoningDepthDisplay();
        
        console.log('[NeuralBrain] Reasoning step:', { step, score, quality });
    }
    
    handleCircuitEvent(data) {
        const { service, state } = data;
        
        this.currentStatus.circuitStates[service] = state;
        this.updateCircuitDisplay();
        
        console.log('[NeuralBrain] Circuit:', { service, state });
    }
    
    handleQualityEvent(data) {
        const { passed, faithfulness, relevance, verdict } = data;
        
        const avgScore = (faithfulness + relevance) / 2;
        this.currentStatus.qualityScore = avgScore;
        this.updateQualityDisplay(avgScore, passed);
        
        // Add USE token for quality check
        this.addReflectionToken('USE', passed, verdict);
        
        console.log('[NeuralBrain] Quality:', { faithfulness, relevance, passed });
    }
    
    // =========================================================================
    // UI UPDATE METHODS
    // =========================================================================
    
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('neural-connection');
        if (indicator) {
            indicator.classList.toggle('connected', connected);
        }
    }
    
    updateModeDisplay() {
        const modeEl = this.elements.cognitiveMode;
        if (!modeEl) return;
        
        // Remove old mode classes
        modeEl.className = 'cognitive-value';
        
        // Add new mode class
        const mode = this.currentStatus.mode;
        modeEl.classList.add(`mode-${mode.toLowerCase()}`);
        modeEl.textContent = mode;
        
        this.flashElement(modeEl, 'active');
    }
    
    updatePathDisplay() {
        const pathEl = this.elements.processingPath;
        if (!pathEl) return;
        
        const path = this.currentStatus.path;
        const pathIcons = {
            'fast': '⚡',
            'standard': '⚙️',
            'deep': '🧠'
        };
        const pathLabels = {
            'fast': 'FAST',
            'standard': 'STANDARD',
            'deep': 'DEEP'
        };
        
        pathEl.className = `cognitive-value path-${path}`;
        pathEl.innerHTML = `
            <span class="path-icon">${pathIcons[path] || '⚙️'}</span>
            <span class="path-label">${pathLabels[path] || 'UNKNOWN'}</span>
        `;
        
        this.flashElement(pathEl, 'active');
    }
    
    updateMemoryDisplay() {
        const memoryEl = this.elements.memoryTier;
        if (!memoryEl) return;
        
        memoryEl.textContent = this.currentStatus.memoryTier;
        this.flashElement(memoryEl, 'active');
    }
    
    updateReasoningDepthDisplay() {
        const depthEl = this.elements.reasoningDepth;
        if (!depthEl) return;
        
        depthEl.textContent = this.currentStatus.reasoningDepth;
        this.flashElement(depthEl, 'active');
    }
    
    updateCircuitDisplay() {
        const container = this.elements.circuitStatus;
        if (!container) return;
        
        const circuits = this.currentStatus.circuitStates;
        const html = Object.entries(circuits).map(([service, state]) => `
            <div class="circuit-indicator">
                <span class="circuit-dot ${state}"></span>
                <span class="circuit-name">${service.split('_').pop()}</span>
            </div>
        `).join('');
        
        container.innerHTML = html;
    }
    
    updateQualityDisplay(score, passed) {
        const barEl = this.elements.qualityScore;
        const valueEl = document.getElementById('quality-value');
        
        if (barEl) {
            barEl.style.width = `${score * 100}%`;
        }
        
        if (valueEl) {
            valueEl.textContent = `${(score * 100).toFixed(0)}%`;
            valueEl.style.color = passed ? 
                NEURAL_CONFIG.colors.success : 
                NEURAL_CONFIG.colors.warning;
        }
    }
    
    addReflectionToken(token, decision, reason) {
        const container = this.elements.reflectionTokens;
        if (!container) return;
        
        // Check if token already exists
        let tokenEl = container.querySelector(`.reflection-token.${token.toLowerCase()}`);
        
        if (!tokenEl) {
            tokenEl = document.createElement('span');
            tokenEl.className = `reflection-token ${token.toLowerCase()}`;
            container.appendChild(tokenEl);
        }
        
        const statusIcon = decision ? '✓' : '✗';
        tokenEl.innerHTML = `
            [${token}]
            <span class="token-status">${statusIcon}</span>
        `;
        tokenEl.title = reason;
        
        // Flash animation
        tokenEl.classList.add('active');
        setTimeout(() => tokenEl.classList.remove('active'), 500);
        
        // Track in state
        if (!this.currentStatus.reflectionTokens.includes(token)) {
            this.currentStatus.reflectionTokens.push(token);
        }
    }
    
    clearReflectionTokens() {
        const container = this.elements.reflectionTokens;
        if (container) {
            container.innerHTML = '';
        }
        this.currentStatus.reflectionTokens = [];
    }
    
    flashElement(element, className) {
        if (!element) return;
        
        element.classList.add(className);
        setTimeout(() => element.classList.remove(className), 300);
    }
    
    // =========================================================================
    // PUBLIC API
    // =========================================================================
    
    show() {
        if (this.elements.cognitiveStatus) {
            this.elements.cognitiveStatus.classList.remove('collapsed');
        }
        // Hide toggle button when panel is open
        const toggleBtn = document.getElementById('neural-brain-toggle');
        if (toggleBtn) {
            toggleBtn.classList.add('hidden');
        }
    }

    hide() {
        if (this.elements.cognitiveStatus) {
            this.elements.cognitiveStatus.classList.add('collapsed');
        }
        // Show toggle button when panel is hidden
        const toggleBtn = document.getElementById('neural-brain-toggle');
        if (toggleBtn) {
            toggleBtn.classList.remove('hidden');
        }
    }

    toggle() {
        if (this.elements.cognitiveStatus) {
            const isCollapsed = this.elements.cognitiveStatus.classList.contains('collapsed');
            if (isCollapsed) {
                this.show();
            } else {
                this.hide();
            }
        }
    }
    
    reset() {
        this.currentStatus = {
            mode: 'NRC',
            tier: 'simple',
            path: 'fast',
            memoryTier: 'L0',
            reasoningDepth: 0,
            reflectionTokens: [],
            circuitStates: {},
            qualityScore: null
        };
        
        this.updateModeDisplay();
        this.updatePathDisplay();
        this.updateMemoryDisplay();
        this.updateReasoningDepthDisplay();
        this.clearReflectionTokens();
        this.updateQualityDisplay(0, true);
    }
    
    getStatus() {
        return { ...this.currentStatus };
    }
}

// =============================================================================
// NEURAL BRAIN API CLIENT
// =============================================================================

class NeuralBrainClient {
    constructor(baseUrl = '/api/neural') {
        this.baseUrl = baseUrl;
        this.statusManager = null;
    }
    
    setStatusManager(manager) {
        this.statusManager = manager;
    }
    
    async processMessage(sessionId, message, phase, context = {}) {
        try {
            // Clear previous reflection tokens
            if (this.statusManager) {
                this.statusManager.clearReflectionTokens();
            }
            
            const response = await fetch(`${this.baseUrl}/process`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    message,
                    phase,
                    context
                })
            });
            
            if (!response.ok) {
                throw new Error(`Neural Brain API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[NeuralBrain] Process error:', error);
            throw error;
        }
    }
    
    async getStatus(sessionId) {
        try {
            const response = await fetch(`${this.baseUrl}/status?session_id=${sessionId}`);
            
            if (!response.ok) {
                throw new Error(`Status API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[NeuralBrain] Status error:', error);
            throw error;
        }
    }
    
    async getSessionMemory(sessionId) {
        try {
            const response = await fetch(`${this.baseUrl}/memory/session/${sessionId}`);
            
            if (!response.ok) {
                throw new Error(`Memory API error: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('[NeuralBrain] Memory error:', error);
            throw error;
        }
    }
}

// =============================================================================
// INTEGRATION WITH EXISTING CHAT
// =============================================================================

class NeuralBrainIntegration {
    constructor() {
        this.statusManager = new CognitiveStatusManager();
        this.apiClient = new NeuralBrainClient();
        this.apiClient.setStatusManager(this.statusManager);
        
        this.sessionId = null;
        this.currentPhase = 1;
        this.context = {};
        
        this.init();
    }
    
    init() {
        // Generate or retrieve session ID
        this.sessionId = this.getSessionId();
        
        // Connect SSE for cognitive status updates
        this.statusManager.connect(this.sessionId);
        
        // Hook into existing chat system
        this.hookIntoChat();
        
        console.log('[NeuralBrain] Integration initialized', { sessionId: this.sessionId });
    }
    
    getSessionId() {
        let sessionId = sessionStorage.getItem('neural_session_id');
        if (!sessionId) {
            sessionId = 'ns_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            sessionStorage.setItem('neural_session_id', sessionId);
        }
        return sessionId;
    }
    
    hookIntoChat() {
        // Hook into the sendMessage function if it exists
        if (typeof window.originalSendMessage === 'undefined' && typeof window.sendMessage === 'function') {
            window.originalSendMessage = window.sendMessage;
            
            window.sendMessage = async (message) => {
                // NOTE: Panel no longer auto-opens - user can toggle via 🧠 button
                // this.statusManager.show();

                // Process through Neural Brain
                try {
                    const result = await this.apiClient.processMessage(
                        this.sessionId,
                        message,
                        this.currentPhase,
                        this.context
                    );
                    
                    // Update context from result
                    if (result.context_update) {
                        this.context = { ...this.context, ...result.context_update };
                    }
                    
                    // Check for phase progression
                    if (result.next_phase) {
                        this.currentPhase = result.next_phase;
                    }
                    
                    // Return response for display
                    return result.content;
                } catch (error) {
                    console.error('[NeuralBrain] Integration error:', error);
                    // Fall back to original
                    return window.originalSendMessage(message);
                }
            };
        }
    }
    
    updatePhase(phase) {
        this.currentPhase = phase;
        console.log('[NeuralBrain] Phase updated:', phase);
    }
    
    updateContext(key, value) {
        this.context[key] = value;
    }
    
    getContext() {
        return { ...this.context };
    }
    
    reset() {
        this.currentPhase = 1;
        this.context = {};
        this.statusManager.reset();
        sessionStorage.removeItem('neural_session_id');
        this.sessionId = this.getSessionId();
        this.statusManager.connect(this.sessionId);
    }
}

// =============================================================================
// GLOBAL INITIALIZATION
// =============================================================================

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the Creative Director page
    if (window.location.pathname.includes('creative-director')) {
        window.NeuralBrain = new NeuralBrainIntegration();
        console.log('[NeuralBrain] Ready');
    }
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CognitiveStatusManager,
        NeuralBrainClient,
        NeuralBrainIntegration,
        NEURAL_CONFIG
    };
}
