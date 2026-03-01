/**
 * ProductionManager v2.0
 * RAGNAROK 8-Phase Production Pipeline Controller
 *
 * Handles SSE streaming from GENESIS production endpoints via fetch
 * Uses ReadableStream for POST endpoints (not EventSource which is GET-only)
 * Manages phase progress, timer, and delivery modal
 *
 * v1.2: Fixed request body format to match GENESIS ProductionStartRequest schema
 * v2.0: Phase 2 - Added SSE streaming from /api/production/status/{id}/stream endpoint
 */

const ProductionManager = (() => {
    // Configuration
    const GENESIS_URL = 'https://api.barriosa2i.com';

    // State
    let abortController = null;
    let timerInterval = null;
    let startTime = null;
    let sessionId = null;
    let currentPhase = null;
    let completedPhases = [];
    let deliveryAssets = null;

    // Phase definitions
    const PHASES = [
        { id: 'intake', name: 'INTAKE', icon: '📋', duration: 5 },
        { id: 'intelligence', name: 'INTEL', icon: '🔍', duration: 15 },
        { id: 'story', name: 'STORY', icon: '📖', duration: 20 },
        { id: 'prompts', name: 'PROMPTS', icon: '🎨', duration: 25 },
        { id: 'video', name: 'VIDEO', icon: '🎥', duration: 120 },
        { id: 'voice', name: 'VOICE', icon: '🎙️', duration: 30 },
        { id: 'assembly', name: 'ASSEMBLY', icon: '🔧', duration: 20 },
        { id: 'qa', name: 'QA', icon: '✅', duration: 8 }
    ];

    /**
     * Start production pipeline
     * @param {string} sid - Session ID from chat
     * @param {Object} brief - Creative brief data from frontend
     */
    async function start(sid, brief = {}) {
        sessionId = sid;
        startTime = Date.now();
        completedPhases = [];
        currentPhase = null;

        // Show production status panel
        const statusPanel = document.getElementById('production-status');
        if (statusPanel) {
            statusPanel.classList.add('active');
        }

        // Reset phase indicators
        resetPhaseIndicators();

        // Start timer
        startTimer();

        // Update message
        updateMessage('Connecting to RAGNAROK pipeline...');

        try {
            // Use fetch streaming for POST with SSE response
            const url = `${GENESIS_URL}/api/production/start/${sessionId}`;
            console.log('[ProductionManager] Starting production via fetch streaming...');
            console.log('[ProductionManager] Input brief:', brief);

            // Create abort controller for cancellation
            abortController = new AbortController();

            // Transform frontend brief to GENESIS ProductionStartRequest format
            // GENESIS expects: { brief: {...}, industry: string, business_name: string }
            const productionRequest = {
                brief: {
                    concept: brief.raw_request || brief.concept || `Commercial for ${brief.company_name || 'business'}`,
                    key_messages: brief.key_messages || [],
                    visual_style: brief.visual_style || brief.style || 'professional',
                    tone: brief.tone || 'professional',
                    target_audience: brief.target_audience || 'general audience',
                    call_to_action: brief.call_to_action || brief.cta || 'Learn more',
                    duration: brief.duration || '30 seconds',
                    voice_id: brief.voice_id || null,
                    voice_name: brief.voice_name || null
                },
                industry: brief.industry || 'general',
                business_name: brief.company_name || brief.business_name || 'Business',
                style: brief.style || 'cinematic',
                goals: brief.goals || ['brand_awareness'],
                target_platforms: brief.target_platforms || ['youtube', 'instagram']
            };

            console.log('[ProductionManager] Transformed request:', productionRequest);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream'
                },
                body: JSON.stringify(productionRequest),
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            console.log('[ProductionManager] SSE connected via fetch');
            updateMessage('Pipeline connected. Starting production...');

            // Read SSE stream using ReadableStream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    console.log('[ProductionManager] Stream completed');
                    break;
                }

                // Decode chunk and add to buffer
                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE messages (format: "data: {...}\n\n")
                const lines = buffer.split('\n\n');
                buffer = lines.pop() || ''; // Keep incomplete message in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const eventData = line.slice(6); // Remove "data: " prefix
                        handleSSEMessage({ data: eventData });
                    }
                }
            }

            // Process any remaining data in buffer
            if (buffer.startsWith('data: ')) {
                const eventData = buffer.slice(6);
                if (eventData.trim()) {
                    handleSSEMessage({ data: eventData });
                }
            }

        } catch (error) {
            console.error('[ProductionManager] Start error:', error);
            updateMessage(`Error: ${error.message}`);
        }
    }

    /**
     * Handle SSE message
     */
    function handleSSEMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('[ProductionManager] SSE:', data);

            switch (data.type) {
                case 'phase_start':
                    handlePhaseStart(data);
                    break;

                case 'phase_progress':
                    handlePhaseProgress(data);
                    break;

                case 'phase_complete':
                    handlePhaseComplete(data);
                    break;

                case 'production_complete':
                    handleProductionComplete(data);
                    break;

                case 'error':
                    handleError(data);
                    break;

                case 'agent_activity':
                    updateMessage(`🤖 ${data.agent}: ${data.activity}`);
                    break;

                default:
                    if (data.message) {
                        updateMessage(data.message);
                    }
            }
        } catch (error) {
            console.error('[ProductionManager] Parse error:', error);
        }
    }

    /**
     * Handle phase start event
     */
    function handlePhaseStart(data) {
        currentPhase = data.phase;

        // Update phase indicator
        const phaseEl = document.querySelector(`[data-phase="${data.phase}"]`);
        if (phaseEl) {
            phaseEl.classList.add('active');
            phaseEl.classList.remove('completed');
        }

        // Update message
        const phaseName = PHASES.find(p => p.id === data.phase)?.name || data.phase;
        updateMessage(`Phase ${data.phase_number}/8: ${phaseName} - ${data.description || 'Processing...'}`);

        // Update progress bar
        updateProgressBar(data.phase_number - 1, 8);
    }

    /**
     * Handle phase progress event
     */
    function handlePhaseProgress(data) {
        if (data.message) {
            updateMessage(data.message);
        }

        if (data.progress !== undefined) {
            // Interpolate progress within current phase
            const phaseIndex = PHASES.findIndex(p => p.id === currentPhase);
            const baseProgress = phaseIndex / 8;
            const phaseProgress = (data.progress / 100) / 8;
            updateProgressBar((baseProgress + phaseProgress) * 8, 8);
        }
    }

    /**
     * Handle phase complete event
     */
    function handlePhaseComplete(data) {
        completedPhases.push(data.phase);

        // Update phase indicator
        const phaseEl = document.querySelector(`[data-phase="${data.phase}"]`);
        if (phaseEl) {
            phaseEl.classList.remove('active');
            phaseEl.classList.add('completed');
        }

        // Update connector
        const connectors = document.querySelectorAll('.prod-phase-connector');
        const phaseIndex = PHASES.findIndex(p => p.id === data.phase);
        if (connectors[phaseIndex]) {
            connectors[phaseIndex].classList.add('completed');
        }

        // Update progress bar
        updateProgressBar(phaseIndex + 1, 8);

        updateMessage(`✅ ${data.phase.toUpperCase()} complete`);
    }

    /**
     * Handle production complete event
     */
    function handleProductionComplete(data) {
        // Stop timer
        stopTimer();

        // Clear abort controller (stream completes naturally with fetch)
        abortController = null;

        // Mark all phases complete
        PHASES.forEach(phase => {
            const phaseEl = document.querySelector(`[data-phase="${phase.id}"]`);
            if (phaseEl) {
                phaseEl.classList.remove('active');
                phaseEl.classList.add('completed');
            }
        });

        // Full progress
        updateProgressBar(8, 8);

        // Store delivery assets
        deliveryAssets = data.assets || {};

        // Show completion message
        updateMessage('🎉 Production complete! Preparing delivery...');

        // Show delivery modal after short delay
        setTimeout(() => {
            showDeliveryModal(data);
        }, 1500);
    }

    /**
     * Handle error event
     */
    function handleError(data) {
        console.error('[ProductionManager] Production error:', data);
        updateMessage(`❌ Error: ${data.message || 'Unknown error'}`);

        // Mark current phase as failed (red styling)
        if (currentPhase) {
            const phaseEl = document.querySelector(`[data-phase="${currentPhase}"]`);
            if (phaseEl) {
                phaseEl.classList.add('error');
            }
        }
    }

    /**
     * Show delivery modal with final assets
     */
    function showDeliveryModal(data) {
        const modal = document.getElementById('delivery-modal');
        if (!modal) return;

        // Set video source
        const video = document.getElementById('delivery-video');
        if (video && data.assets?.video_url) {
            video.querySelector('source').src = data.assets.video_url;
            video.poster = data.assets.thumbnail_url || '';
            video.load();
        }

        // Set stats
        setDeliveryStat('delivery-duration', data.assets?.duration || '--');
        setDeliveryStat('delivery-resolution', data.assets?.resolution || '1080p');
        setDeliveryStat('delivery-format', data.assets?.format || 'MP4');
        setDeliveryStat('delivery-size', formatFileSize(data.assets?.size_bytes));

        // Show modal
        modal.classList.add('active');

        // Hide production status
        const statusPanel = document.getElementById('production-status');
        if (statusPanel) {
            statusPanel.classList.remove('active');
        }
    }

    /**
     * Close delivery modal
     */
    function closeDelivery() {
        const modal = document.getElementById('delivery-modal');
        if (modal) {
            modal.classList.remove('active');
        }

        // Reset state
        reset();
    }

    /**
     * Download asset in specified format
     */
    function download(format) {
        if (!deliveryAssets) {
            console.error('[ProductionManager] No assets to download');
            return;
        }

        const url = deliveryAssets[`${format}_url`] || deliveryAssets.video_url;
        if (url) {
            window.open(url, '_blank');
        }
    }

    /**
     * Start new production
     */
    function newProduction() {
        closeDelivery();
        // Reset chat or trigger new brief
        // This will be handled by the chat interface
    }

    /**
     * Cancel production
     */
    function cancel() {
        // Abort fetch stream
        if (abortController) {
            abortController.abort();
            abortController = null;
        }

        stopTimer();

        const statusPanel = document.getElementById('production-status');
        if (statusPanel) {
            statusPanel.classList.remove('active');
        }

        reset();

        // Notify backend
        if (sessionId) {
            fetch(`${GENESIS_URL}/api/production/cancel/${sessionId}`, {
                method: 'POST'
            }).catch(console.error);
        }
    }

    /**
     * Reset all state
     */
    function reset() {
        completedPhases = [];
        currentPhase = null;
        deliveryAssets = null;
        sessionId = null;
        startTime = null;

        resetPhaseIndicators();
        updateProgressBar(0, 8);
        updateMessage('Initializing RAGNAROK pipeline...');
    }

    /**
     * Reset phase indicators
     */
    function resetPhaseIndicators() {
        document.querySelectorAll('.prod-phase').forEach(el => {
            el.classList.remove('active', 'completed', 'error');
        });
        document.querySelectorAll('.prod-phase-connector').forEach(el => {
            el.classList.remove('completed');
        });
    }

    /**
     * Start production timer
     */
    function startTimer() {
        const timerEl = document.getElementById('production-timer');
        if (!timerEl) return;

        timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    /**
     * Stop production timer
     */
    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    /**
     * Update progress bar
     */
    function updateProgressBar(completed, total) {
        const bar = document.getElementById('production-progress');
        if (bar) {
            const percent = (completed / total) * 100;
            bar.style.width = `${percent}%`;
        }
    }

    /**
     * Update status message
     */
    function updateMessage(text) {
        const msgEl = document.getElementById('production-message');
        if (msgEl) {
            msgEl.textContent = text;
        }
    }

    /**
     * Set delivery stat value
     */
    function setDeliveryStat(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    /**
     * Format file size
     */
    function formatFileSize(bytes) {
        if (!bytes) return '--';
        const units = ['B', 'KB', 'MB', 'GB'];
        let unitIndex = 0;
        let size = bytes;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    /**
     * Check production status (reconnection not supported with fetch streaming)
     * Production must be restarted if connection is lost
     */
    async function checkStatus() {
        if (sessionId) {
            const status = await getStatus();
            if (status) {
                console.log('[ProductionManager] Production status:', status);
                updateMessage(`Status: ${status.phase} - ${status.status}`);
            }
        }
    }

    /**
     * Get current status
     */
    async function getStatus() {
        if (!sessionId) return null;

        try {
            const response = await fetch(`${GENESIS_URL}/api/production/status/${sessionId}`);
            return await response.json();
        } catch (error) {
            console.error('[ProductionManager] Status error:', error);
            return null;
        }
    }

    /**
     * Phase 2: Connect to SSE streaming endpoint for real-time updates
     * Uses EventSource for GET endpoint at /api/production/status/{id}/stream
     */
    let eventSource = null;

    function connectToSSE(sid) {
        if (eventSource) {
            eventSource.close();
        }

        sessionId = sid;
        const url = `${GENESIS_URL}/api/production/status/${sessionId}/stream`;
        console.log('[ProductionManager] Connecting to SSE stream:', url);

        eventSource = new EventSource(url);

        eventSource.addEventListener('status', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[ProductionManager] SSE status:', data);

                // Update phase indicator
                const step = data.step;
                if (step) {
                    // Map step names to our phase IDs
                    const stepToPhase = {
                        'script': 'story',
                        'visuals': 'prompts',
                        'voice': 'voice',
                        'edit': 'assembly',
                        'upload': 'qa',
                        'queued': 'intake'
                    };
                    const phaseId = stepToPhase[step] || step;
                    currentPhase = phaseId;

                    const phaseEl = document.querySelector(`[data-phase="${phaseId}"]`);
                    if (phaseEl) {
                        phaseEl.classList.add('active');
                    }
                }

                // Update progress bar
                if (data.overall_progress !== undefined) {
                    updateProgressBar(data.overall_progress, 100);
                }

                // Update timer from server elapsed time
                if (data.elapsed !== undefined) {
                    const minutes = Math.floor(data.elapsed / 60).toString().padStart(2, '0');
                    const seconds = (data.elapsed % 60).toString().padStart(2, '0');
                    const timerEl = document.getElementById('production-timer');
                    if (timerEl) {
                        timerEl.textContent = `${minutes}:${seconds}`;
                    }
                }

                // Update estimated remaining
                if (data.estimated_remaining !== undefined) {
                    updateMessage(`Processing... ~${Math.ceil(data.estimated_remaining / 60)} min remaining`);
                }
            } catch (e) {
                console.error('[ProductionManager] SSE status parse error:', e);
            }
        });

        eventSource.addEventListener('complete', (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('[ProductionManager] SSE complete:', data);

                handleProductionComplete({
                    assets: {
                        video_url: data.video_url,
                        duration: `${data.total_time}s`
                    }
                });

                eventSource.close();
                eventSource = null;
            } catch (e) {
                console.error('[ProductionManager] SSE complete parse error:', e);
            }
        });

        eventSource.addEventListener('error', (event) => {
            if (event.data) {
                try {
                    const data = JSON.parse(event.data);
                    handleError(data);
                } catch (e) {
                    handleError({ message: 'Stream error' });
                }
            } else {
                console.warn('[ProductionManager] SSE connection error, will retry...');
            }
        });

        eventSource.onerror = (error) => {
            console.error('[ProductionManager] EventSource error:', error);
            // EventSource auto-reconnects, but we log the error
        };

        return eventSource;
    }

    /**
     * Phase 2: Disconnect SSE stream
     */
    function disconnectSSE() {
        if (eventSource) {
            eventSource.close();
            eventSource = null;
        }
    }

    /**
     * Phase 2: Start production with SSE streaming from Phase 2 endpoint
     * This uses the simpler GET SSE endpoint instead of POST streaming
     */
    async function startWithSSE(sid, brief = {}) {
        sessionId = sid;
        startTime = Date.now();
        completedPhases = [];
        currentPhase = null;

        // Show production status panel
        const statusPanel = document.getElementById('production-status');
        if (statusPanel) {
            statusPanel.classList.add('active');
        }

        // Reset phase indicators
        resetPhaseIndicators();

        // Start timer
        startTimer();

        // Update message
        updateMessage('Connecting to production stream...');

        // Connect to SSE stream
        connectToSSE(sid);
    }

    // Public API
    return {
        start,
        startWithSSE,       // Phase 2
        connectToSSE,       // Phase 2
        disconnectSSE,      // Phase 2
        cancel,
        reset,
        getStatus,
        checkStatus,
        closeDelivery,
        download,
        newProduction,
        PHASES
    };
})();

// Make globally available
if (typeof window !== 'undefined') {
    window.ProductionManager = ProductionManager;
}

console.log('[ProductionManager] v2.0 loaded - RAGNAROK 8-Phase Pipeline Controller (Phase 2: SSE streaming endpoint)');
