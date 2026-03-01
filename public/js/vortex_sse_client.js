/**
 * ================================================================================
 * VORTEX v2.1 SSE CLIENT - Video Assembly Progress Streaming
 * ================================================================================
 * Real-time video assembly progress streaming from VORTEX (integrated in GENESIS)
 *
 * Integrates with Creative Director chat widget on barrios-landing.vercel.app
 *
 * Usage:
 *   const vortex = new VortexSSEClient();
 *   vortex.connect(jobId, {
 *     onProgress: (data) => updateUI(data),
 *     onComplete: (data) => showVideo(data),
 *     onError: (err) => handleError(err)
 *   });
 *
 * Author: Barrios A2I | VORTEX v2.1 LEGENDARY | January 2026
 * ================================================================================
 */

(function() {
    'use strict';

    // =============================================================================
    // CONFIGURATION
    // =============================================================================

    const VORTEX_CONFIG = {
        // VORTEX is integrated into GENESIS (same service)
        BASE_URL: 'https://api.barriosa2i.com',

        // Endpoints
        STREAM_URL: '/api/vortex/stream',
        HEALTH_URL: '/api/vortex/health',
        JOB_URL: '/api/vortex/job',
        GRAPH_URL: '/api/vortex/graph-structure',

        // Timeouts
        CONNECTION_TIMEOUT: 30000,
        MAX_ASSEMBLY_TIME: 300000, // 5 minutes max for video assembly

        // Retry settings
        MAX_RETRIES: 3,
        RETRY_DELAY: 2000,
    };

    // =============================================================================
    // VORTEX PIPELINE PHASES
    // =============================================================================

    const VORTEX_PHASES = {
        init: { label: 'Initializing', icon: '⚡', progress: 0 },
        routing: { label: 'Analyzing Complexity', icon: '🧠', progress: 5 },
        asset_download: { label: 'Downloading Assets', icon: '📥', progress: 15 },
        scene_analysis: { label: 'AI Scene Analysis', icon: '🔍', progress: 30 },
        transition_selection: { label: 'Selecting Transitions', icon: '🎯', progress: 40 },
        clip_assembly: { label: 'Assembling Clips', icon: '🎬', progress: 60 },
        audio_sync: { label: 'Syncing Audio', icon: '🔊', progress: 75 },
        format_render: { label: 'Rendering Formats', icon: '🎞️', progress: 90 },
        quality_check: { label: 'Quality Check', icon: '✅', progress: 95 },
        completed: { label: 'Video Ready!', icon: '🚀', progress: 100 },
        failed: { label: 'Assembly Failed', icon: '❌', progress: 100 },
    };

    // =============================================================================
    // VORTEX SSE CLIENT CLASS
    // =============================================================================

    class VortexSSEClient {
        constructor(options = {}) {
            this.baseUrl = options.baseUrl || VORTEX_CONFIG.BASE_URL;
            this.eventSource = null;
            this.currentJobId = null;
            this.callbacks = {};
            this.retryCount = 0;
            this.connectionTimeout = null;
            this.isConnected = false;
        }

        /**
         * Connect to VORTEX SSE stream for a job
         * @param {string} jobId - VORTEX job ID
         * @param {Object} callbacks - Event callbacks
         */
        connect(jobId, callbacks = {}) {
            this.currentJobId = jobId;
            this.callbacks = {
                onProgress: callbacks.onProgress || (() => {}),
                onComplete: callbacks.onComplete || (() => {}),
                onError: callbacks.onError || (() => {}),
                onHeartbeat: callbacks.onHeartbeat || (() => {}),
            };

            this._initEventSource();
        }

        /**
         * Initialize EventSource connection
         */
        _initEventSource() {
            if (this.eventSource) {
                this.eventSource.close();
            }

            const streamUrl = `${this.baseUrl}${VORTEX_CONFIG.STREAM_URL}/${this.currentJobId}`;
            console.log(`[VORTEX] Connecting to SSE: ${streamUrl}`);

            this.eventSource = new EventSource(streamUrl);
            this.isConnected = true;

            // Connection timeout
            this.connectionTimeout = setTimeout(() => {
                if (!this.isConnected) {
                    this._handleError(new Error('Connection timeout'));
                }
            }, VORTEX_CONFIG.CONNECTION_TIMEOUT);

            // Event handlers
            this.eventSource.addEventListener('progress', (event) => {
                this._clearTimeout();
                this._handleProgress(JSON.parse(event.data));
            });

            this.eventSource.addEventListener('complete', (event) => {
                this._clearTimeout();
                this._handleComplete(JSON.parse(event.data));
            });

            this.eventSource.addEventListener('heartbeat', (event) => {
                this.callbacks.onHeartbeat(JSON.parse(event.data));
            });

            this.eventSource.onerror = (error) => {
                this._handleError(error);
            };

            this.eventSource.onopen = () => {
                console.log('[VORTEX] SSE connection established');
                this.retryCount = 0;
                this._clearTimeout();
            };
        }

        /**
         * Handle progress events
         */
        _handleProgress(data) {
            const phase = VORTEX_PHASES[data.phase] || VORTEX_PHASES.init;

            const progressData = {
                jobId: data.job_id,
                phase: data.phase,
                phaseLabel: data.phase_label || phase.label,
                icon: phase.icon,
                progress: data.progress_pct || phase.progress,
                version: data.version,
                hasErrors: data.has_errors,
                finalOutputs: data.final_outputs || {},
            };

            console.log(`[VORTEX] Progress: ${progressData.phaseLabel} (${progressData.progress}%)`);
            this.callbacks.onProgress(progressData);
        }

        /**
         * Handle completion event
         */
        _handleComplete(data) {
            const isSuccess = data.phase === 'completed' || data.phase === 'COMPLETED';

            const completeData = {
                jobId: data.job_id,
                phase: data.phase,
                success: isSuccess,
                finalOutputs: data.final_outputs || {},
                errors: data.errors || [],
            };

            console.log(`[VORTEX] Complete: ${isSuccess ? 'SUCCESS' : 'FAILED'}`);
            this.callbacks.onComplete(completeData);
            this.disconnect();
        }

        /**
         * Handle errors with retry logic
         */
        _handleError(error) {
            console.error('[VORTEX] SSE Error:', error);

            if (this.retryCount < VORTEX_CONFIG.MAX_RETRIES) {
                this.retryCount++;
                console.log(`[VORTEX] Retry ${this.retryCount}/${VORTEX_CONFIG.MAX_RETRIES}`);

                setTimeout(() => {
                    this._initEventSource();
                }, VORTEX_CONFIG.RETRY_DELAY * this.retryCount);
            } else {
                this.callbacks.onError({
                    message: 'Connection failed after retries',
                    error: error,
                });
                this.disconnect();
            }
        }

        /**
         * Clear connection timeout
         */
        _clearTimeout() {
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
                this.connectionTimeout = null;
            }
        }

        /**
         * Disconnect from SSE stream
         */
        disconnect() {
            this._clearTimeout();
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = null;
            }
            this.isConnected = false;
            this.currentJobId = null;
            console.log('[VORTEX] Disconnected');
        }

        /**
         * Get job status via REST API
         */
        async getJobStatus(jobId) {
            const response = await fetch(`${this.baseUrl}${VORTEX_CONFIG.JOB_URL}/${jobId}`);
            if (!response.ok) {
                throw new Error(`Job status failed: ${response.status}`);
            }
            return response.json();
        }

        /**
         * Check VORTEX health
         */
        async checkHealth() {
            const response = await fetch(`${this.baseUrl}${VORTEX_CONFIG.HEALTH_URL}`);
            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }
            return response.json();
        }

        /**
         * Get pipeline graph structure
         */
        async getGraphStructure() {
            const response = await fetch(`${this.baseUrl}${VORTEX_CONFIG.GRAPH_URL}`);
            if (!response.ok) {
                throw new Error(`Graph structure failed: ${response.status}`);
            }
            return response.json();
        }
    }

    // =============================================================================
    // VORTEX PROGRESS UI COMPONENT
    // =============================================================================

    class VortexProgressUI {
        constructor(containerId) {
            this.container = document.getElementById(containerId);
            this.currentPhase = null;
        }

        /**
         * Render progress UI
         */
        render(data) {
            if (!this.container) return;

            this.currentPhase = data.phase;
            const phase = VORTEX_PHASES[data.phase] || VORTEX_PHASES.init;

            this.container.innerHTML = `
                <div class="vortex-progress">
                    <div class="vortex-header">
                        <span class="vortex-icon">${phase.icon}</span>
                        <span class="vortex-title">VORTEX Video Assembly</span>
                        <span class="vortex-status">${data.progress}%</span>
                    </div>
                    <div class="vortex-bar-container">
                        <div class="vortex-bar" style="width: ${data.progress}%"></div>
                    </div>
                    <div class="vortex-phase">${data.phaseLabel}</div>
                    ${this._renderPhaseList(data.phase)}
                </div>
            `;
        }

        /**
         * Render phase list with current state
         */
        _renderPhaseList(currentPhase) {
            const phases = Object.entries(VORTEX_PHASES)
                .filter(([key]) => !['failed'].includes(key));

            let reachedCurrent = false;

            return `
                <div class="vortex-phases">
                    ${phases.map(([key, phase]) => {
                        const isCurrent = key === currentPhase;
                        const isComplete = !reachedCurrent && !isCurrent;
                        if (isCurrent) reachedCurrent = true;

                        return `
                            <div class="vortex-phase-item ${isCurrent ? 'active' : ''} ${isComplete ? 'complete' : ''}">
                                <span class="vortex-phase-icon">${phase.icon}</span>
                                <span class="vortex-phase-label">${phase.label}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        /**
         * Show completion state
         */
        showComplete(data) {
            if (!this.container) return;

            const isSuccess = data.success;
            const outputs = Object.entries(data.finalOutputs || {});

            this.container.innerHTML = `
                <div class="vortex-complete ${isSuccess ? 'success' : 'error'}">
                    <div class="vortex-complete-icon">${isSuccess ? '🚀' : '❌'}</div>
                    <div class="vortex-complete-title">
                        ${isSuccess ? 'Video Assembly Complete!' : 'Assembly Failed'}
                    </div>
                    ${isSuccess && outputs.length > 0 ? `
                        <div class="vortex-outputs">
                            ${outputs.map(([format, url]) => `
                                <a href="${url}" target="_blank" class="vortex-output-link">
                                    📹 ${format}
                                </a>
                            `).join('')}
                        </div>
                    ` : ''}
                    ${!isSuccess && data.errors?.length > 0 ? `
                        <div class="vortex-errors">
                            ${data.errors.map(e => `<div class="vortex-error">${e.message || e}</div>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        }

        /**
         * Show error state
         */
        showError(error) {
            if (!this.container) return;

            this.container.innerHTML = `
                <div class="vortex-complete error">
                    <div class="vortex-complete-icon">❌</div>
                    <div class="vortex-complete-title">Connection Error</div>
                    <div class="vortex-error">${error.message}</div>
                </div>
            `;
        }
    }

    // =============================================================================
    // CSS STYLES (inject once)
    // =============================================================================

    const VORTEX_STYLES = `
        .vortex-progress {
            font-family: 'JetBrains Mono', 'SF Mono', monospace;
            background: linear-gradient(135deg, rgba(10, 10, 15, 0.95), rgba(20, 20, 30, 0.95));
            border: 1px solid rgba(0, 206, 209, 0.3);
            border-radius: 12px;
            padding: 20px;
            margin: 16px 0;
        }

        .vortex-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
        }

        .vortex-icon {
            font-size: 24px;
        }

        .vortex-title {
            flex: 1;
            font-size: 14px;
            font-weight: 600;
            color: #00CED1;
            letter-spacing: 0.05em;
        }

        .vortex-status {
            font-size: 16px;
            font-weight: 700;
            color: #fff;
        }

        .vortex-bar-container {
            height: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 12px;
        }

        .vortex-bar {
            height: 100%;
            background: linear-gradient(90deg, #00CED1, #8B008B);
            border-radius: 4px;
            transition: width 0.5s ease;
        }

        .vortex-phase {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.7);
            margin-bottom: 16px;
        }

        .vortex-phases {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .vortex-phase-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 10px;
            color: rgba(255, 255, 255, 0.4);
            background: rgba(255, 255, 255, 0.05);
        }

        .vortex-phase-item.active {
            color: #00CED1;
            background: rgba(0, 206, 209, 0.15);
            border: 1px solid rgba(0, 206, 209, 0.3);
        }

        .vortex-phase-item.complete {
            color: rgba(255, 255, 255, 0.6);
        }

        .vortex-phase-item.complete .vortex-phase-icon::after {
            content: '✓';
            margin-left: 4px;
            color: #22c55e;
        }

        .vortex-complete {
            text-align: center;
            padding: 24px;
            background: linear-gradient(135deg, rgba(10, 10, 15, 0.95), rgba(20, 20, 30, 0.95));
            border-radius: 12px;
            border: 1px solid rgba(0, 206, 209, 0.3);
        }

        .vortex-complete.success {
            border-color: rgba(34, 197, 94, 0.5);
        }

        .vortex-complete.error {
            border-color: rgba(239, 68, 68, 0.5);
        }

        .vortex-complete-icon {
            font-size: 48px;
            margin-bottom: 12px;
        }

        .vortex-complete-title {
            font-size: 18px;
            font-weight: 700;
            color: #fff;
            margin-bottom: 16px;
        }

        .vortex-outputs {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .vortex-output-link {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            background: rgba(0, 206, 209, 0.1);
            border: 1px solid rgba(0, 206, 209, 0.3);
            border-radius: 8px;
            color: #00CED1;
            text-decoration: none;
            font-size: 12px;
            transition: all 0.2s ease;
        }

        .vortex-output-link:hover {
            background: rgba(0, 206, 209, 0.2);
            transform: translateY(-1px);
        }

        .vortex-errors {
            margin-top: 12px;
        }

        .vortex-error {
            padding: 8px 12px;
            background: rgba(239, 68, 68, 0.1);
            border-radius: 4px;
            color: #ef4444;
            font-size: 11px;
            margin-bottom: 4px;
        }
    `;

    // Inject styles once
    if (!document.getElementById('vortex-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'vortex-styles';
        styleEl.textContent = VORTEX_STYLES;
        document.head.appendChild(styleEl);
    }

    // =============================================================================
    // CONVENIENCE FUNCTION
    // =============================================================================

    /**
     * Initialize VORTEX progress tracking for a job
     * @param {string} jobId - VORTEX job ID
     * @param {string} containerId - Container element ID for progress UI
     * @returns {VortexSSEClient} - Client instance
     */
    function initVortexProgress(jobId, containerId = 'vortex-progress-container') {
        const client = new VortexSSEClient();
        const ui = new VortexProgressUI(containerId);

        client.connect(jobId, {
            onProgress: (data) => ui.render(data),
            onComplete: (data) => ui.showComplete(data),
            onError: (error) => ui.showError(error),
        });

        return client;
    }

    // =============================================================================
    // EXPORTS
    // =============================================================================

    window.VortexSSEClient = VortexSSEClient;
    window.VortexProgressUI = VortexProgressUI;
    window.initVortexProgress = initVortexProgress;
    window.VORTEX_PHASES = VORTEX_PHASES;
    window.VORTEX_CONFIG = VORTEX_CONFIG;

})();
