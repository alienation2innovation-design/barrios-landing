/**
 * ================================================================================
 * NEXUS SSE CLIENT v1.0
 * ================================================================================
 * Production pipeline SSE streaming client for NEXUS UNIFIED ORCHESTRATOR
 *
 * Integrates with Creative Director chat widget on barrios-landing.vercel.app
 *
 * Usage:
 *   const client = initLegendaryProduction(sessionId);
 *   // Progress UI automatically rendered in #production-container
 *
 * Author: Barrios A2I | NEXUS Integration | January 2026
 * ================================================================================
 */

(function() {
    'use strict';

    // =============================================================================
    // CONFIGURATION
    // =============================================================================

    const CONFIG = {
        // Creative Director API (gateway to NEXUS - handles brief compilation & routing)
        CD_API_URL: 'https://api.barriosa2i.com',

        // Timeouts
        CONNECTION_TIMEOUT: 30000,
        MAX_PRODUCTION_TIME: 600000, // 10 minutes max

        // Retry settings
        MAX_RETRIES: 3,
        RETRY_DELAY: 2000,
    };

    // =============================================================================
    // PRODUCTION PHASES
    // =============================================================================

    const PHASES = [
        { id: 'initialization', label: 'Initializing', icon: '⚡', duration: 5 },
        { id: 'neural_rag', label: 'Neural Analysis', icon: '🧠', duration: 15 },
        { id: 'trinity', label: 'Market Intelligence', icon: '🔮', duration: 25 },
        { id: 'script', label: 'Script Generation', icon: '📝', duration: 20 },
        { id: 'ragnarok', label: 'Video Production', icon: '🎬', duration: 30 },
        { id: 'complete', label: 'Delivery', icon: '✅', duration: 5 },
    ];

    // =============================================================================
    // CSS STYLES (injected once)
    // =============================================================================

    const STYLES = `
        .nexus-production {
            font-family: 'JetBrains Mono', 'SF Mono', monospace;
            color: #fff;
        }

        .nexus-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(0, 206, 209, 0.2);
        }

        .nexus-logo {
            width: 48px;
            height: 48px;
            background: linear-gradient(135deg, #00CED1, #8B008B);
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }

        .nexus-title {
            font-size: 20px;
            font-weight: 700;
            color: #00CED1;
            letter-spacing: 0.05em;
        }

        .nexus-subtitle {
            font-size: 11px;
            color: rgba(255,255,255,0.5);
            letter-spacing: 0.1em;
        }

        .nexus-status-badge {
            margin-left: auto;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 10px;
            font-weight: 600;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        .nexus-status-badge.running {
            background: rgba(0, 206, 209, 0.2);
            border: 1px solid rgba(0, 206, 209, 0.5);
            color: #00CED1;
            animation: pulse-glow 2s infinite;
        }

        .nexus-status-badge.complete {
            background: rgba(16, 185, 129, 0.2);
            border: 1px solid rgba(16, 185, 129, 0.5);
            color: #10b981;
        }

        .nexus-status-badge.error {
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.5);
            color: #ef4444;
        }

        @keyframes pulse-glow {
            0%, 100% { box-shadow: 0 0 5px rgba(0, 206, 209, 0.3); }
            50% { box-shadow: 0 0 20px rgba(0, 206, 209, 0.6); }
        }

        .nexus-phases {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 24px;
        }

        .nexus-phase {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05);
            border-radius: 8px;
            transition: all 0.3s ease;
        }

        .nexus-phase.active {
            background: rgba(0, 206, 209, 0.1);
            border-color: rgba(0, 206, 209, 0.3);
        }

        .nexus-phase.completed {
            background: rgba(16, 185, 129, 0.08);
            border-color: rgba(16, 185, 129, 0.2);
        }

        .nexus-phase.error {
            background: rgba(239, 68, 68, 0.08);
            border-color: rgba(239, 68, 68, 0.2);
        }

        .nexus-phase-icon {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            background: rgba(255,255,255,0.05);
            border-radius: 8px;
        }

        .nexus-phase.active .nexus-phase-icon {
            background: rgba(0, 206, 209, 0.2);
            animation: icon-pulse 1.5s infinite;
        }

        .nexus-phase.completed .nexus-phase-icon {
            background: rgba(16, 185, 129, 0.2);
        }

        @keyframes icon-pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }

        .nexus-phase-info {
            flex: 1;
        }

        .nexus-phase-label {
            font-size: 13px;
            font-weight: 600;
            color: #fff;
        }

        .nexus-phase-status {
            font-size: 10px;
            color: rgba(255,255,255,0.5);
            margin-top: 2px;
        }

        .nexus-phase.active .nexus-phase-status {
            color: #00CED1;
        }

        .nexus-phase.completed .nexus-phase-status {
            color: #10b981;
        }

        .nexus-phase-progress {
            width: 60px;
            height: 4px;
            background: rgba(255,255,255,0.1);
            border-radius: 2px;
            overflow: hidden;
        }

        .nexus-phase-progress-bar {
            height: 100%;
            background: linear-gradient(90deg, #00CED1, #00F3FF);
            border-radius: 2px;
            transition: width 0.3s ease;
        }

        .nexus-phase.completed .nexus-phase-progress-bar {
            width: 100% !important;
            background: #10b981;
        }

        .nexus-overall-progress {
            margin-bottom: 24px;
        }

        .nexus-progress-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .nexus-progress-label {
            font-size: 12px;
            color: rgba(255,255,255,0.7);
        }

        .nexus-progress-percent {
            font-size: 14px;
            font-weight: 700;
            color: #00CED1;
        }

        .nexus-progress-track {
            height: 8px;
            background: rgba(255,255,255,0.1);
            border-radius: 4px;
            overflow: hidden;
        }

        .nexus-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00CED1, #8B008B, #ffd700);
            background-size: 200% 100%;
            animation: gradient-flow 2s linear infinite;
            border-radius: 4px;
            transition: width 0.5s ease;
        }

        @keyframes gradient-flow {
            0% { background-position: 0% 50%; }
            100% { background-position: 200% 50%; }
        }

        .nexus-eta {
            margin-top: 8px;
            font-size: 11px;
            color: rgba(255,255,255,0.5);
            text-align: center;
        }

        .nexus-deliverables {
            margin-top: 24px;
            padding: 20px;
            background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(0, 206, 209, 0.1));
            border: 1px solid rgba(16, 185, 129, 0.3);
            border-radius: 12px;
        }

        .nexus-deliverables-title {
            font-size: 16px;
            font-weight: 700;
            color: #10b981;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .nexus-deliverable-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
        }

        .nexus-deliverable-card {
            padding: 16px;
            background: rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            transition: all 0.2s ease;
        }

        .nexus-deliverable-card:hover {
            border-color: rgba(0, 206, 209, 0.5);
            transform: translateY(-2px);
        }

        .nexus-deliverable-platform {
            font-size: 11px;
            color: #00CED1;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-bottom: 8px;
        }

        .nexus-deliverable-format {
            font-size: 13px;
            color: #fff;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .nexus-deliverable-specs {
            font-size: 10px;
            color: rgba(255,255,255,0.5);
            margin-bottom: 12px;
        }

        .nexus-download-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 8px 14px;
            background: linear-gradient(135deg, #00CED1, #00F3FF);
            color: #000;
            border: none;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.2s ease;
            text-decoration: none;
        }

        .nexus-download-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 15px rgba(0, 206, 209, 0.4);
        }

        .nexus-error-container {
            padding: 16px;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 8px;
            margin-top: 16px;
        }

        .nexus-error-title {
            font-size: 14px;
            font-weight: 600;
            color: #ef4444;
            margin-bottom: 8px;
        }

        .nexus-error-message {
            font-size: 12px;
            color: rgba(255,255,255,0.7);
            margin-bottom: 12px;
        }

        .nexus-retry-btn {
            padding: 8px 16px;
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.5);
            color: #ef4444;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .nexus-retry-btn:hover {
            background: rgba(239, 68, 68, 0.3);
        }

        .nexus-cancel-btn {
            margin-top: 16px;
            padding: 10px 20px;
            background: transparent;
            border: 1px solid rgba(255,255,255,0.2);
            color: rgba(255,255,255,0.6);
            border-radius: 6px;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .nexus-cancel-btn:hover {
            border-color: rgba(239, 68, 68, 0.5);
            color: #ef4444;
        }

        .nexus-hidden {
            display: none !important;
        }
    `;

    // =============================================================================
    // INJECT STYLES
    // =============================================================================

    function injectStyles() {
        if (document.getElementById('nexus-styles')) return;

        const style = document.createElement('style');
        style.id = 'nexus-styles';
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    // =============================================================================
    // PRODUCTION CLIENT CLASS
    // =============================================================================

    class NexusProductionClient {
        constructor(sessionId, container) {
            this.sessionId = sessionId;
            this.container = container;
            this.eventSource = null;
            this.currentPhase = null;
            this.progress = 0;
            this.startTime = null;
            this.canceled = false;
            this.deliverables = null;
            this.retryCount = 0;

            this.render();
        }

        render() {
            this.container.innerHTML = `
                <div class="nexus-production">
                    <div class="nexus-header">
                        <div class="nexus-logo">🚀</div>
                        <div>
                            <div class="nexus-title">NEXUS PRODUCTION</div>
                            <div class="nexus-subtitle">UNIFIED ORCHESTRATOR v1.0</div>
                        </div>
                        <div class="nexus-status-badge running" id="nexus-status">
                            INITIALIZING
                        </div>
                    </div>

                    <div class="nexus-overall-progress">
                        <div class="nexus-progress-header">
                            <span class="nexus-progress-label">Overall Progress</span>
                            <span class="nexus-progress-percent" id="nexus-overall-percent">0%</span>
                        </div>
                        <div class="nexus-progress-track">
                            <div class="nexus-progress-fill" id="nexus-overall-bar" style="width: 0%"></div>
                        </div>
                        <div class="nexus-eta" id="nexus-eta">Estimating time remaining...</div>
                    </div>

                    <div class="nexus-phases" id="nexus-phases">
                        ${PHASES.map((phase, idx) => `
                            <div class="nexus-phase" id="nexus-phase-${phase.id}" data-phase-index="${idx}">
                                <div class="nexus-phase-icon">${phase.icon}</div>
                                <div class="nexus-phase-info">
                                    <div class="nexus-phase-label">${phase.label}</div>
                                    <div class="nexus-phase-status">Pending</div>
                                </div>
                                <div class="nexus-phase-progress">
                                    <div class="nexus-phase-progress-bar" style="width: 0%"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="nexus-deliverables nexus-hidden" id="nexus-deliverables">
                        <div class="nexus-deliverables-title">
                            <span>🎉</span> Your Deliverables Are Ready!
                        </div>
                        <div class="nexus-deliverable-cards" id="nexus-deliverable-cards"></div>
                    </div>

                    <div class="nexus-error-container nexus-hidden" id="nexus-error">
                        <div class="nexus-error-title">⚠️ Production Error</div>
                        <div class="nexus-error-message" id="nexus-error-message"></div>
                        <button class="nexus-retry-btn" onclick="window.nexusClient.retry()">
                            🔄 Retry Production
                        </button>
                    </div>

                    <button class="nexus-cancel-btn" id="nexus-cancel" onclick="window.nexusClient.cancel()">
                        Cancel Production
                    </button>
                </div>
            `;
        }

        async start() {
            this.startTime = Date.now();
            this.canceled = false;

            try {
                // Start production via Creative Director's NEXUS endpoint
                // The Creative Director compiles the brief internally from session data
                await this.startProduction();
            } catch (error) {
                console.error('Production start error:', error);
                this.showError(error.message || 'Failed to start production');
            }
        }

        async startProduction() {
            this.updateStatus('running', 'PRODUCING');
            this.setPhaseActive('initialization');

            // Connect to Creative Director's NEXUS production endpoint (SSE)
            // This endpoint compiles the brief and streams to NEXUS orchestrator
            const url = `${CONFIG.CD_API_URL}/api/session/${this.sessionId}/produce`;

            console.log('🚀 Starting NEXUS production via Creative Director:', url);

            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream'
                    },
                    body: JSON.stringify({
                        priority: 'normal'
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.detail || `Production API error: ${response.status}`);
                }

                // Process SSE stream
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    if (this.canceled) break;

                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });

                    // Process complete SSE events
                    const events = buffer.split('\n\n');
                    buffer = events.pop() || '';

                    for (const eventStr of events) {
                        if (!eventStr.trim()) continue;
                        this.processSSEEvent(eventStr);
                    }
                }

            } catch (error) {
                console.error('SSE stream error:', error);
                this.showError(error.message);
            }
        }

        processSSEEvent(eventStr) {
            let eventType = 'message';
            let eventData = null;

            for (const line of eventStr.split('\n')) {
                if (line.startsWith('event:')) {
                    eventType = line.substring(6).trim();
                } else if (line.startsWith('data:')) {
                    try {
                        eventData = JSON.parse(line.substring(5).trim());
                    } catch (e) {
                        eventData = { raw: line.substring(5).trim() };
                    }
                }
            }

            if (!eventData) return;

            console.log(`[${eventType}]`, eventData);

            switch (eventType) {
                case 'progress':
                    this.handleProgress(eventData);
                    break;
                case 'complete':
                case 'completed':
                    this.handleComplete(eventData);
                    break;
                case 'error':
                case 'failed':
                    this.handleError(eventData);
                    break;
                default:
                    this.handleProgress(eventData);
            }
        }

        handleProgress(data) {
            const phase = data.phase || this.currentPhase;
            const progress = data.progress || 0;
            const message = data.message || '';

            // Update overall progress
            this.progress = progress;
            this.updateOverallProgress(progress);

            // Map API phase to our UI phase
            const phaseId = this.mapPhaseId(phase);
            if (phaseId && phaseId !== this.currentPhase) {
                this.setPhaseActive(phaseId);
            }

            // Update phase status message
            if (phaseId) {
                this.updatePhaseStatus(phaseId, message || 'Processing...');
            }

            // Update ETA
            this.updateETA(progress);
        }

        handleComplete(data) {
            this.progress = 100;
            this.updateOverallProgress(100);
            this.updateStatus('complete', 'COMPLETE');

            // Mark all phases complete
            PHASES.forEach(p => this.setPhaseComplete(p.id));

            // Hide cancel button
            document.getElementById('nexus-cancel')?.classList.add('nexus-hidden');

            // Show deliverables
            if (data.deliverables) {
                this.deliverables = data.deliverables;
                this.renderDeliverables(data.deliverables);
            } else if (data.metadata?.deliverables) {
                this.deliverables = data.metadata.deliverables;
                this.renderDeliverables(data.metadata.deliverables);
            } else {
                // Mock deliverables for demo
                this.renderDeliverables({
                    youtube: { url: '#', format: 'MP4 1080p', duration: '30s' },
                    tiktok: { url: '#', format: 'MP4 9:16', duration: '15s' },
                    instagram: { url: '#', format: 'MP4 1:1', duration: '15s' }
                });
            }

            // Notify parent page
            if (typeof window.onProductionComplete === 'function') {
                window.onProductionComplete(data);
            }
        }

        handleError(data) {
            const message = data.message || 'An unknown error occurred';
            this.showError(message);
            this.updateStatus('error', 'ERROR');
        }

        // ==========================================================================
        // UI UPDATE METHODS
        // ==========================================================================

        updateOverallProgress(percent) {
            const bar = document.getElementById('nexus-overall-bar');
            const label = document.getElementById('nexus-overall-percent');

            if (bar) bar.style.width = `${percent}%`;
            if (label) label.textContent = `${Math.round(percent)}%`;
        }

        updateETA(progress) {
            const eta = document.getElementById('nexus-eta');
            if (!eta) return;

            if (progress >= 100) {
                eta.textContent = 'Production complete!';
                return;
            }

            const elapsed = Date.now() - this.startTime;
            if (progress > 5) {
                const totalEstimate = (elapsed / progress) * 100;
                const remaining = totalEstimate - elapsed;
                const minutes = Math.ceil(remaining / 60000);
                eta.textContent = minutes > 1
                    ? `Approximately ${minutes} minutes remaining`
                    : 'Less than a minute remaining';
            }
        }

        updateStatus(status, text) {
            const badge = document.getElementById('nexus-status');
            if (!badge) return;

            badge.className = `nexus-status-badge ${status}`;
            badge.textContent = text;
        }

        setPhaseActive(phaseId) {
            // Mark previous phases as complete
            const phaseIndex = PHASES.findIndex(p => p.id === phaseId);

            PHASES.forEach((p, idx) => {
                const el = document.getElementById(`nexus-phase-${p.id}`);
                if (!el) return;

                el.classList.remove('active', 'completed');

                if (idx < phaseIndex) {
                    el.classList.add('completed');
                    const status = el.querySelector('.nexus-phase-status');
                    if (status) status.textContent = 'Complete';
                    const bar = el.querySelector('.nexus-phase-progress-bar');
                    if (bar) bar.style.width = '100%';
                } else if (idx === phaseIndex) {
                    el.classList.add('active');
                    const status = el.querySelector('.nexus-phase-status');
                    if (status) status.textContent = 'In Progress...';
                }
            });

            this.currentPhase = phaseId;
        }

        setPhaseComplete(phaseId) {
            const el = document.getElementById(`nexus-phase-${phaseId}`);
            if (!el) return;

            el.classList.remove('active');
            el.classList.add('completed');

            const status = el.querySelector('.nexus-phase-status');
            if (status) status.textContent = 'Complete';

            const bar = el.querySelector('.nexus-phase-progress-bar');
            if (bar) bar.style.width = '100%';
        }

        updatePhaseStatus(phaseId, message) {
            const el = document.getElementById(`nexus-phase-${phaseId}`);
            if (!el) return;

            const status = el.querySelector('.nexus-phase-status');
            if (status) status.textContent = message;
        }

        showError(message) {
            const errorEl = document.getElementById('nexus-error');
            const msgEl = document.getElementById('nexus-error-message');

            if (errorEl) errorEl.classList.remove('nexus-hidden');
            if (msgEl) msgEl.textContent = message;

            this.updateStatus('error', 'ERROR');
        }

        hideError() {
            const errorEl = document.getElementById('nexus-error');
            if (errorEl) errorEl.classList.add('nexus-hidden');
        }

        renderDeliverables(deliverables) {
            const container = document.getElementById('nexus-deliverables');
            const cards = document.getElementById('nexus-deliverable-cards');

            if (!container || !cards) return;

            container.classList.remove('nexus-hidden');

            const platformIcons = {
                youtube: '📺',
                tiktok: '🎵',
                instagram: '📷',
                linkedin: '💼',
                twitter: '🐦',
                facebook: '📘'
            };

            cards.innerHTML = Object.entries(deliverables).map(([platform, data]) => `
                <div class="nexus-deliverable-card">
                    <div class="nexus-deliverable-platform">
                        ${platformIcons[platform] || '🎬'} ${platform.toUpperCase()}
                    </div>
                    <div class="nexus-deliverable-format">${data.format || 'Video'}</div>
                    <div class="nexus-deliverable-specs">${data.duration || '30s'}</div>
                    <a href="${data.url || '#'}"
                       class="nexus-download-btn"
                       target="_blank"
                       ${data.url ? '' : 'onclick="alert(\'Download coming soon!\'); return false;"'}>
                        ⬇️ Download
                    </a>
                </div>
            `).join('');
        }

        // ==========================================================================
        // EXTRACTION HELPERS
        // ==========================================================================

        mapPhaseId(apiPhase) {
            const mapping = {
                'initialization': 'initialization',
                'starting': 'initialization',
                'neural_rag': 'neural_rag',
                'analysis': 'neural_rag',
                'trinity': 'trinity',
                'research': 'trinity',
                'market_intelligence': 'trinity',
                'script': 'script',
                'script_generation': 'script',
                'ragnarok': 'ragnarok',
                'video': 'ragnarok',
                'video_production': 'ragnarok',
                'production': 'ragnarok',
                'complete': 'complete',
                'completed': 'complete',
                'delivery': 'complete'
            };
            return mapping[apiPhase?.toLowerCase()] || apiPhase;
        }

        // ==========================================================================
        // CONTROL METHODS
        // ==========================================================================

        cancel(reason = 'User canceled') {
            this.canceled = true;
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            this.updateStatus('error', 'CANCELED');
            console.log('Production canceled:', reason);
        }

        retry() {
            this.hideError();
            this.retryCount++;
            this.render();
            this.start();
        }

        /**
         * Check production status via Creative Director API
         */
        async checkStatus() {
            try {
                const response = await fetch(
                    `${CONFIG.CD_API_URL}/api/session/${this.sessionId}/production`
                );
                if (!response.ok) throw new Error('Status check failed');
                return await response.json();
            } catch (error) {
                console.error('Status check error:', error);
                return null;
            }
        }

        /**
         * Fetch deliverables after production completes
         */
        async fetchDeliverables() {
            try {
                const response = await fetch(
                    `${CONFIG.CD_API_URL}/api/session/${this.sessionId}/deliverables`
                );
                if (!response.ok) throw new Error('Deliverables fetch failed');
                const data = await response.json();

                if (data.deliverables) {
                    this.deliverables = data.deliverables;
                    this.renderDeliverables(data.deliverables);
                }

                return data;
            } catch (error) {
                console.error('Deliverables fetch error:', error);
                return null;
            }
        }
    }

    // =============================================================================
    // GLOBAL INITIALIZATION FUNCTION
    // =============================================================================

    /**
     * Initialize legendary production
     * Called from creative-director page when user clicks "Start Production"
     *
     * @param {string} sessionId - Creative Director session ID
     * @param {HTMLElement} container - Optional container element (defaults to #production-container)
     * @returns {NexusProductionClient} - The production client instance
     */
    function initLegendaryProduction(sessionId, container = null) {
        injectStyles();

        // Find container
        const targetContainer = container || document.getElementById('production-container');
        if (!targetContainer) {
            console.error('Production container not found. Create a <div id="production-container"></div>');
            return null;
        }

        // Show container
        targetContainer.style.display = 'block';

        // Create client
        const client = new NexusProductionClient(sessionId, targetContainer);

        // Store globally for retry/cancel buttons
        window.nexusClient = client;

        // Start production
        client.start();

        return client;
    }

    // =============================================================================
    // EXPORT TO GLOBAL SCOPE
    // =============================================================================

    window.initLegendaryProduction = initLegendaryProduction;
    window.NexusProductionClient = NexusProductionClient;

    // Dispatch ready event for integrations (e.g., agent-visuals-integration.js)
    window.dispatchEvent(new CustomEvent('nexus-client-ready'));

    // Log that client is loaded
    console.log('✅ NEXUS SSE Client v1.0 loaded - use initLegendaryProduction(sessionId) to start');

})();
