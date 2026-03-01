/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║  RAGNAROK GENESIS - LEGENDARY SESSION MANAGER v3.0                           ║
 * ║  Frontier Model Integration: Claude 4.5 + GPT-5.2 + Gemini 3.0               ║
 * ║  Chief Systems Architect: Barrios A2I                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 * 
 * FIXES:
 * - Browser refresh no longer resets intake progress
 * - Engine selection persists across sessions
 * - Adaptive thinking levels for Gemini 3.0
 * 
 * STORAGE HIERARCHY:
 * - L0: Memory (window.GenesisState) - Active conversation
 * - L1: sessionStorage - Intake progress (survives refresh)
 * - L2: localStorage - Engine preference (persists forever)
 * - L3: Backend - Recovery snapshot (24h TTL)
 */

// =============================================================================
// FRONTIER ENGINE DEFINITIONS
// =============================================================================

const FRONTIER_ENGINES = {
    claude_sonnet_45: {
        id: 'claude_sonnet_45',
        modelId: 'claude-sonnet-4-5-20250929',
        displayName: 'Claude 4.5 Sonnet',
        provider: 'anthropic',
        icon: '🧠',
        color: '#D97706',  // Amber
        glowColor: 'rgba(217, 119, 6, 0.5)',
        strength: 'Agentic workflows & coding',
        description: 'Extended thinking with effort control. Best for complex strategy synthesis.',
        maxContext: '200K',
        maxOutput: '64K',
        typicalLatency: '800ms',
        costIndicator: '$$',
        capabilities: {
            effort: true,
            thinking: true,
            vision: true,
            tools: true
        },
        recommended: ['strategy', 'creative', 'agentic']
    },
    
    gpt52: {
        id: 'gpt52',
        modelId: 'gpt-5.2-thinking',
        displayName: 'ChatGPT 5.2',
        provider: 'openai',
        icon: '⚡',
        color: '#10B981',  // Emerald
        glowColor: 'rgba(16, 185, 129, 0.5)',
        strength: 'SOTA knowledge work & logic',
        description: 'Enhanced tool-calling for long-running agents. Professional reasoning.',
        maxContext: '400K',
        maxOutput: '32K',
        typicalLatency: '1500ms',
        costIndicator: '$$$',
        capabilities: {
            effort: false,
            thinking: true,
            vision: true,
            tools: true  // Enhanced
        },
        recommended: ['analysis', 'agentic']
    },
    
    gemini_flash_30: {
        id: 'gemini_flash_30',
        modelId: 'gemini-3.0-flash-preview',
        displayName: 'Gemini 3.0 Flash',
        provider: 'google',
        icon: '💎',
        color: '#00CED1',  // Neon Cyan
        glowColor: 'rgba(0, 206, 209, 0.5)',
        strength: 'Ultra-low latency & multimodal',
        description: 'PhD-level reasoning with thinking levels. 1M context window.',
        maxContext: '1M',
        maxOutput: '65K',
        typicalLatency: '300ms',
        costIndicator: '$',
        capabilities: {
            thinkingLevels: true,  // MINIMAL, LOW, MEDIUM, HIGH
            vision: true,
            tools: true
        },
        recommended: ['intake', 'analysis'],
        thinkingLevels: ['MINIMAL', 'LOW', 'MEDIUM', 'HIGH']
    }
};

// Default engine for different task types
const TASK_ENGINE_DEFAULTS = {
    intake: 'gemini_flash_30',      // Fast responses
    analysis: 'gemini_flash_30',     // Quick analysis
    strategy: 'claude_sonnet_45',    // Deep reasoning
    creative: 'claude_sonnet_45',    // Creative synthesis
    agentic: 'gpt52'                 // Tool-heavy workflows
};


// =============================================================================
// GENESIS SESSION MANAGER v3.0
// =============================================================================

const GenesisSession = {
    VERSION: 'v3.0.0',
    STORAGE_KEY: 'genesis_session_v3',
    ENGINE_KEY: 'barrios_active_engine',
    BACKUP_KEY: 'genesis_session_backup',
    
    // Default session state
    defaultState: {
        id: null,
        version: 'v3.0.0',
        created: null,
        updated: null,
        activeEngine: 'gemini_flash_30',  // Default to fastest
        phase: 1,
        answers: {},
        uploadedAssets: [],
        conversationHistory: [],
        metrics: {
            totalCost: 0,
            requestCount: 0,
            totalLatency: 0,
            tokensByEngine: {},
            thinkingTokens: 0
        }
    },
    
    /**
     * Initialize session - recovers from storage or creates new
     */
    init() {
        console.log('[GenesisSession v3] Initializing Legendary Engine...');
        
        // Recover engine preference from localStorage (persists forever)
        const savedEngine = localStorage.getItem(this.ENGINE_KEY);
        
        // Try to recover session from sessionStorage
        const stored = this._loadFromStorage();
        
        if (stored && this._isValid(stored)) {
            console.log('[GenesisSession v3] Recovered session:', stored.id);
            
            // Apply saved engine preference if exists
            if (savedEngine && FRONTIER_ENGINES[savedEngine]) {
                stored.activeEngine = savedEngine;
            }
            
            window.GenesisState = stored;
            this._syncToBackend(stored);
            this._updateEngineHUD(stored.activeEngine);
            return stored;
        }
        
        // Create new session
        console.log('[GenesisSession v3] Creating new session');
        const session = this._createNew(savedEngine);
        this.save(session);
        this._registerWithBackend(session);
        return session;
    },
    
    /**
     * Create new session with UUID
     */
    _createNew(preferredEngine = null) {
        const engine = preferredEngine && FRONTIER_ENGINES[preferredEngine] 
            ? preferredEngine 
            : 'gemini_flash_30';
        
        const session = {
            ...this.defaultState,
            id: this._generateUUID(),
            created: Date.now(),
            updated: Date.now(),
            activeEngine: engine
        };
        
        window.GenesisState = session;
        localStorage.setItem(this.ENGINE_KEY, engine);
        
        return session;
    },
    
    /**
     * Load from sessionStorage
     */
    _loadFromStorage() {
        try {
            const raw = sessionStorage.getItem(this.STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            console.error('[GenesisSession v3] Failed to load from storage:', e);
            return null;
        }
    },
    
    /**
     * Validate session integrity
     */
    _isValid(session) {
        if (!session || !session.id) return false;
        
        // Version check with migration
        if (!session.version || !session.version.startsWith('v3')) {
            console.log('[GenesisSession v3] Migrating from older version');
            return this._migrate(session);
        }
        
        // TTL check (24 hours)
        const age = Date.now() - session.created;
        if (age > 24 * 60 * 60 * 1000) {
            console.log('[GenesisSession v3] Session expired');
            return false;
        }
        
        return true;
    },
    
    /**
     * Migrate from older session format
     */
    _migrate(oldSession) {
        try {
            const migrated = {
                ...this.defaultState,
                ...oldSession,
                version: this.VERSION,
                updated: Date.now(),
                activeEngine: oldSession.activeEngine || oldSession.modelTier || 'gemini_flash_30'
            };
            
            // Migrate modelTier to activeEngine
            if (oldSession.modelTier) {
                const tierMap = {
                    'flash': 'gemini_flash_30',
                    'standard': 'claude_sonnet_45',
                    'premium': 'claude_sonnet_45'
                };
                migrated.activeEngine = tierMap[oldSession.modelTier] || 'gemini_flash_30';
            }
            
            window.GenesisState = migrated;
            this.save(migrated);
            return true;
        } catch (e) {
            console.error('[GenesisSession v3] Migration failed:', e);
            return false;
        }
    },
    
    /**
     * Save session to sessionStorage
     */
    save(session = window.GenesisState) {
        if (!session) return;
        
        session.updated = Date.now();
        
        try {
            sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
            localStorage.setItem(this.ENGINE_KEY, session.activeEngine);
            
            // Backup for crash recovery
            localStorage.setItem(this.BACKUP_KEY, JSON.stringify({
                id: session.id,
                phase: session.phase,
                engine: session.activeEngine,
                timestamp: Date.now()
            }));
            
            window.GenesisState = session;
        } catch (e) {
            console.error('[GenesisSession v3] Failed to save:', e);
        }
    },
    
    /**
     * Set active reasoning engine
     */
    setEngine(engineId) {
        if (!FRONTIER_ENGINES[engineId]) {
            console.error('[GenesisSession v3] Invalid engine:', engineId);
            return false;
        }
        
        const session = this.get();
        session.activeEngine = engineId;
        this.save(session);
        
        // Persist to localStorage for cross-session preference
        localStorage.setItem(this.ENGINE_KEY, engineId);
        
        // Update UI
        this._updateEngineHUD(engineId);
        
        console.log('[GenesisSession v3] Engine switched to:', FRONTIER_ENGINES[engineId].displayName);
        return true;
    },
    
    /**
     * Get active engine config
     */
    getActiveEngine() {
        const session = this.get();
        return FRONTIER_ENGINES[session.activeEngine] || FRONTIER_ENGINES.gemini_flash_30;
    },
    
    /**
     * Get optimal engine for task type
     */
    getEngineForTask(taskType) {
        const engineId = TASK_ENGINE_DEFAULTS[taskType] || 'gemini_flash_30';
        return FRONTIER_ENGINES[engineId];
    },
    
    /**
     * Update Engine HUD display
     */
    _updateEngineHUD(engineId) {
        const engine = FRONTIER_ENGINES[engineId];
        if (!engine) return;
        
        // Update all engine indicators
        document.querySelectorAll('.engine-indicator').forEach(el => {
            el.textContent = `${engine.icon} ${engine.displayName}`;
            el.style.color = engine.color;
            el.style.textShadow = `0 0 10px ${engine.glowColor}`;
        });
        
        // Update engine selector buttons
        document.querySelectorAll('.engine-option').forEach(el => {
            const isActive = el.dataset.engine === engineId;
            el.classList.toggle('active', isActive);
            if (isActive) {
                el.style.borderColor = engine.color;
                el.style.boxShadow = `0 0 20px ${engine.glowColor}`;
            } else {
                el.style.borderColor = 'rgba(255,255,255,0.1)';
                el.style.boxShadow = 'none';
            }
        });
        
        // Update brain profile section
        const profileEl = document.getElementById('brain-profile');
        if (profileEl) {
            profileEl.innerHTML = `
                <div class="profile-header" style="color: ${engine.color}">
                    <span class="profile-icon">${engine.icon}</span>
                    <span class="profile-name">${engine.displayName}</span>
                </div>
                <div class="profile-strength">${engine.strength}</div>
                <div class="profile-stats">
                    <div class="stat">
                        <span class="stat-label">Context</span>
                        <span class="stat-value">${engine.maxContext}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Latency</span>
                        <span class="stat-value">${engine.typicalLatency}</span>
                    </div>
                    <div class="stat">
                        <span class="stat-label">Cost</span>
                        <span class="stat-value">${engine.costIndicator}</span>
                    </div>
                </div>
            `;
        }
    },
    
    /**
     * Record intake answer
     */
    recordAnswer(phase, question, answer) {
        const session = this.get();
        
        session.answers[`phase_${phase}`] = {
            question,
            answer,
            timestamp: Date.now(),
            engine: session.activeEngine
        };
        
        session.phase = Math.min(phase + 1, 10);
        session.conversationHistory.push({
            role: 'user',
            content: answer,
            phase,
            timestamp: Date.now()
        });
        
        this.save(session);
        return session;
    },
    
    /**
     * Record AI response with engine metrics
     */
    recordResponse(phase, response, metrics = {}) {
        const session = this.get();
        
        session.conversationHistory.push({
            role: 'assistant',
            content: response,
            phase,
            engine: metrics.engine || session.activeEngine,
            timestamp: Date.now()
        });
        
        // Update metrics
        if (metrics.cost) session.metrics.totalCost += metrics.cost;
        if (metrics.latency) session.metrics.totalLatency += metrics.latency;
        if (metrics.thinkingTokens) session.metrics.thinkingTokens += metrics.thinkingTokens;
        
        session.metrics.requestCount++;
        
        // Track tokens by engine
        const engine = metrics.engine || session.activeEngine;
        if (!session.metrics.tokensByEngine[engine]) {
            session.metrics.tokensByEngine[engine] = { input: 0, output: 0 };
        }
        if (metrics.inputTokens) session.metrics.tokensByEngine[engine].input += metrics.inputTokens;
        if (metrics.outputTokens) session.metrics.tokensByEngine[engine].output += metrics.outputTokens;
        
        this.save(session);
        return session;
    },
    
    /**
     * Add uploaded asset
     */
    addAsset(asset) {
        const session = this.get();
        session.uploadedAssets.push({
            ...asset,
            addedAt: Date.now()
        });
        this.save(session);
        return session;
    },
    
    /**
     * Remove asset by ID
     */
    removeAsset(assetId) {
        const session = this.get();
        session.uploadedAssets = session.uploadedAssets.filter(a => a.id !== assetId);
        this.save(session);
        return session;
    },
    
    /**
     * Get current session state
     */
    get() {
        return window.GenesisState || this.init();
    },
    
    /**
     * Check if intake is complete
     */
    isIntakeComplete() {
        const session = this.get();
        return session.phase > 10 || Object.keys(session.answers).length >= 10;
    },
    
    /**
     * Get intake summary for strategy generation
     */
    getIntakeSummary() {
        const session = this.get();
        return {
            sessionId: session.id,
            activeEngine: session.activeEngine,
            answers: session.answers,
            assets: session.uploadedAssets,
            metrics: session.metrics
        };
    },
    
    /**
     * Clear session (start over)
     */
    clear() {
        console.log('[GenesisSession v3] Clearing session');
        sessionStorage.removeItem(this.STORAGE_KEY);
        // Keep engine preference in localStorage
        window.GenesisState = null;
        return this.init();
    },
    
    /**
     * Full reset including engine preference
     */
    fullReset() {
        console.log('[GenesisSession v3] Full reset');
        sessionStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.ENGINE_KEY);
        localStorage.removeItem(this.BACKUP_KEY);
        window.GenesisState = null;
        return this.init();
    },
    
    /**
     * Register session with backend
     */
    async _registerWithBackend(session) {
        try {
            const response = await fetch('https://api.barriosa2i.com/api/genesis/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: session.id,
                    engine: session.activeEngine
                })
            });

            if (response.ok) {
                const data = await response.json();
                console.log('[GenesisSession v3] Registered with backend:', data);
            }
        } catch (e) {
            console.warn('[GenesisSession v3] Backend registration failed (offline mode):', e);
        }
    },
    
    /**
     * Sync session to backend
     * NOTE: Session sync endpoint not implemented on GENESIS - using local storage only
     */
    async _syncToBackend(session) {
        // Session sync disabled - endpoint /api/genesis/session/sync doesn't exist
        // Data is persisted to localStorage instead
        console.debug('[GenesisSession v3] Session sync skipped (local storage only)');
    },
    
    /**
     * Generate UUID v4
     */
    _generateUUID() {
        if (crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }
};


// =============================================================================
// GENESIS INTAKE MANAGER v3.0
// =============================================================================

const GenesisIntake = {
    API_BASE: window.GENESIS_API_URL || 'https://api.barriosa2i.com',
    
    /**
     * Initialize intake UI from session state
     */
    init() {
        const session = GenesisSession.get();

        // Restore UI state - initialize with 0% and all fields missing
        const allRequiredFields = ['business_name', 'primary_offering', 'target_demographic', 'call_to_action', 'tone'];
        this._updateProgressBar(0, allRequiredFields);
        this._restoreConversation(session.conversationHistory);
        this._restoreUploadedAssets(session.uploadedAssets);

        // Initialize engine HUD
        GenesisSession._updateEngineHUD(session.activeEngine);

        console.log(`[GenesisIntake v3] Initialized with ${session.activeEngine}`);
    },
    
    /**
     * Send user message with automatic engine selection
     */
    async sendMessage(userMessage) {
        const session = GenesisSession.get();
        const engine = session.activeEngine;
        
        // Determine thinking level for Gemini 3.0
        const thinkingLevel = session.phase <= 5 ? 'LOW' : 'MEDIUM';
        
        // Record user message
        GenesisSession.recordAnswer(
            session.phase,
            this._getCurrentQuestion(session.phase),
            userMessage
        );
        
        // Show typing indicator with engine info
        this._showTypingIndicator(engine);
        
        try {
            const response = await fetch(`${this.API_BASE}/api/genesis/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: session.id,
                    message: userMessage,
                    conversation_history: session.conversationHistory || []
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            // DEBUG: Log full API response
            console.log('[Phase3] API Response:', data);
            console.log('[Phase3] progress_percentage:', data.progress_percentage);
            console.log('[Phase3] missing_fields:', data.missing_fields);
            console.log('[Phase3] extracted_fields:', data.metadata?.extracted_fields);

            // Record AI response with Phase 2 fields
            GenesisSession.recordResponse(session.phase, data.response, {
                cost: data.cost_usd || 0,
                latency: data.latency_ms || 0,
                engine: engine,
                inputTokens: data.input_tokens || 0,
                outputTokens: data.tokens_used || 0,
                thinkingTokens: data.thinking_tokens || 0
            });

            // Update UI with Phase 2 progress tracking
            this._hideTypingIndicator();
            this._appendMessage('assistant', data.response, engine);
            console.log('[Phase3] Calling _updateProgressBar with:', data.progress_percentage, data.missing_fields);
            this._updateProgressBar(data.progress_percentage, data.missing_fields);
            this._updateMetricsDisplay(session.metrics);

            // Show brief summary when complete
            if (data.is_complete) {
                this._showBriefSummary(data.extracted_data);
            }

            // Auto-trigger production if ready
            if (data.trigger_production) {
                this._startProduction(session.id, data.extracted_data);
            }

            return data;
            
        } catch (error) {
            console.error('[GenesisIntake v3] API error:', error);
            this._hideTypingIndicator();
            this._showError('Connection failed. Your progress is saved.');
            throw error;
        }
    },
    
    /**
     * Generate strategy with optimal engine
     */
    async generateStrategy() {
        const session = GenesisSession.get();
        
        // Use Claude 4.5 Sonnet for strategy (best for complex synthesis)
        const strategyEngine = 'claude_sonnet_45';
        
        this._showStrategyLoading(strategyEngine);
        
        try {
            const response = await fetch(`${this.API_BASE}/api/genesis/strategy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: session.id,
                    engine: strategyEngine,
                    include_assets: true
                })
            });
            
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            this._hideStrategyLoading();
            this._displayStrategy(data);
            
            return data;
            
        } catch (error) {
            console.error('[GenesisIntake v3] Strategy generation failed:', error);
            this._hideStrategyLoading();
            this._showError('Strategy generation failed. Please try again.');
            throw error;
        }
    },
    
    /**
     * Stream strategy for real-time display
     */
    async streamStrategy() {
        const session = GenesisSession.get();
        const strategyEngine = 'claude_sonnet_45';
        
        this._showStrategyLoading(strategyEngine);
        
        const container = document.getElementById('strategy-content');
        if (!container) return;
        
        container.innerHTML = '';
        
        try {
            const response = await fetch(
                `${this.API_BASE}/api/genesis/stream/${session.id}?engine=${strategyEngine}`
            );
            
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            this._hideStrategyLoading();
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.content) {
                                container.innerHTML += parsed.content;
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (error) {
            console.error('[GenesisIntake v3] Stream failed:', error);
            this._hideStrategyLoading();
        }
    },
    
    /**
     * Get current intake question
     */
    _getCurrentQuestion(phase) {
        const questions = {
            1: "What's your business name and what product/service is this commercial for?",
            2: "Who is your target audience? (demographics, interests, pain points)",
            3: "What's your unique value proposition? What makes you different?",
            4: "What emotion do you want viewers to feel?",
            5: "What's your primary call-to-action?",
            6: "What's your budget range and timeline?",
            7: "Any competitor references or inspiration?",
            8: "What platforms will this run on? (YouTube, Instagram, TikTok, etc.)",
            9: "Do you have brand guidelines, logos, or assets to include?",
            10: "Any additional requirements or constraints?"
        };
        return questions[phase] || "Tell me more about your project.";
    },
    
    /**
     * Update progress bar with Phase 2 fields
     */
    _updateProgressBar(progressPercentage, missingFields) {
        // FIXED: Use correct selector for progress bar (was .brief-progress-fill)
        const progressBar = document.getElementById('ni-progress-bar');

        // FIXED: Create status label if it doesn't exist
        let phaseLabel = document.getElementById('ni-phase-status');
        if (!phaseLabel) {
            // Create status label element dynamically
            phaseLabel = document.createElement('div');
            phaseLabel.id = 'ni-phase-status';
            phaseLabel.style.cssText = `
                position: absolute;
                top: 6px;
                left: 50%;
                transform: translateX(-50%);
                font-size: 10px;
                font-weight: 600;
                letter-spacing: 0.5px;
                z-index: 101;
                color: #00ced1;
                text-shadow: 0 0 8px rgba(0, 206, 209, 0.6);
                white-space: nowrap;
                pointer-events: none;
            `;

            // Insert after progress bar container
            const progressContainer = document.getElementById('ni-progress-bar-container');
            if (progressContainer && progressContainer.parentElement) {
                progressContainer.parentElement.insertBefore(phaseLabel, progressContainer.nextSibling);
            }
        }

        // Update progress bar width (0-100%)
        if (progressBar) {
            progressBar.style.width = `${progressPercentage || 0}%`;

            // Change color to green when complete
            if (progressPercentage >= 100) {
                progressBar.style.background = 'linear-gradient(90deg, #10b981, #059669)';
                progressBar.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.6)';
            } else {
                progressBar.style.background = 'linear-gradient(90deg, #00CED1, #00FFFF, #00CED1)';
                progressBar.style.boxShadow = '0 0 10px rgba(0, 206, 209, 0.5)';
            }
        }

        // Update status label
        if (phaseLabel) {
            if (progressPercentage >= 100) {
                phaseLabel.textContent = '✓ BRIEF COMPLETE - READY FOR PRODUCTION';
                phaseLabel.style.color = '#10b981';
                phaseLabel.style.textShadow = '0 0 8px rgba(16, 185, 129, 0.6)';
            } else if (missingFields && missingFields.length > 0) {
                const fieldLabels = {
                    business_name: 'Business',
                    primary_offering: 'Product',
                    target_demographic: 'Audience',
                    call_to_action: 'CTA',
                    tone: 'Tone'
                };
                const missing = missingFields.map(f => fieldLabels[f] || f).join(', ');
                phaseLabel.textContent = `${progressPercentage}% COMPLETE • NEED: ${missing.toUpperCase()}`;
                phaseLabel.style.color = '#00ced1';
                phaseLabel.style.textShadow = '0 0 8px rgba(0, 206, 209, 0.6)';
            } else {
                phaseLabel.textContent = `${progressPercentage}% COMPLETE`;
                phaseLabel.style.color = '#00ced1';
                phaseLabel.style.textShadow = '0 0 8px rgba(0, 206, 209, 0.6)';
            }
        }
    },
    
    /**
     * Get phase name
     */
    _getPhaseName(phase) {
        const names = {
            1: 'Introduction',
            2: 'Audience',
            3: 'Value Prop',
            4: 'Emotion',
            5: 'CTA',
            6: 'Budget',
            7: 'Inspiration',
            8: 'Distribution',
            9: 'Assets',
            10: 'Final Details'
        };
        return names[phase] || 'Complete';
    },

    /**
     * Show brief summary when complete
     */
    _showBriefSummary(extractedData) {
        if (!extractedData) return;

        const container = document.querySelector('.chat-messages');
        if (!container) return;

        // Create summary card
        const summaryHTML = `
            <div class="brief-summary-card">
                <div class="summary-header">
                    <span class="summary-icon">✓</span>
                    <h3>Brief Complete</h3>
                </div>
                <div class="summary-content">
                    ${extractedData.business_name ? `<div class="summary-field"><strong>Business:</strong> ${extractedData.business_name}</div>` : ''}
                    ${extractedData.primary_offering ? `<div class="summary-field"><strong>Product:</strong> ${extractedData.primary_offering}</div>` : ''}
                    ${extractedData.target_demographic ? `<div class="summary-field"><strong>Audience:</strong> ${extractedData.target_demographic}</div>` : ''}
                    ${extractedData.call_to_action ? `<div class="summary-field"><strong>CTA:</strong> ${extractedData.call_to_action}</div>` : ''}
                    ${extractedData.tone ? `<div class="summary-field"><strong>Tone:</strong> ${extractedData.tone}</div>` : ''}
                </div>
                <div class="summary-actions">
                    <button onclick="GenesisIntake._confirmProduction()" class="btn-primary pulse-glow">
                        Launch Production →
                    </button>
                </div>
            </div>
        `;

        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'message-wrapper brief-summary';
        summaryDiv.innerHTML = summaryHTML;
        container.appendChild(summaryDiv);
        container.scrollTop = container.scrollHeight;
    },

    /**
     * Confirm and start production
     */
    _confirmProduction() {
        const session = GenesisSession.get();
        this._startProduction(session.id);
    },

    /**
     * Start RAGNAROK production pipeline - shows voice selector
     */
    async _startProduction(sessionId, extractedData = {}) {
        console.log('[GenesisIntake v3] Starting production flow for session:', sessionId);
        console.log('[GenesisIntake v3] Extracted data:', extractedData);

        try {
            const session = GenesisSession.get();

            // Build production brief from extracted data
            const productionBrief = {
                session_id: sessionId,
                business_name: extractedData.business_name || 'Your Business',
                primary_offering: extractedData.primary_offering || extractedData.product || 'Product/Service',
                target_demographic: extractedData.target_demographic || extractedData.audience || 'Target Audience',
                tone: extractedData.tone || 'professional',
                call_to_action: extractedData.call_to_action || extractedData.cta || 'Learn More',
                platform: extractedData.platform || 'instagram',
                key_message: extractedData.key_message || '',
                duration: extractedData.duration || 30,
                ...extractedData  // Include any additional fields
            };

            console.log('[GenesisIntake v3] Production brief assembled:', productionBrief);

            // Store for voice selector access (required by showVoiceSelector in creative-director.html)
            window.currentProductionBrief = productionBrief;
            window.currentSessionId = sessionId;

            this._hideTypingIndicator();

            // Check if voice selector function exists (defined in creative-director.html)
            if (typeof showVoiceSelector === 'function') {
                console.log('[GenesisIntake v3] Opening voice selector modal...');

                // Add message prompting user to select voice
                this._appendMessage('assistant',
                    '🎙️ <strong>Choose a voice for your commercial!</strong><br>Select from our library of professional AI voices below.',
                    'system'
                );

                // Show the voice selector UI
                showVoiceSelector();

            } else {
                // Fallback: Voice selector not available
                console.warn('[GenesisIntake v3] Voice selector not available, triggering with default voice');
                this._appendMessage('assistant',
                    '🚀 Starting production with default voice...',
                    'system'
                );

                // Call the actual production trigger with default voice
                // This would require implementing _triggerProductionDirect() method
                // For now, show error to avoid broken state
                this._showError('Voice selector unavailable. Please refresh and try again.');
            }

        } catch (error) {
            console.error('[GenesisIntake v3] Production setup error:', error);
            this._hideTypingIndicator();
            this._showError('Failed to prepare production. Please try again.');
        }
    },

    /**
     * Restore conversation history
     */
    _restoreConversation(history) {
        const container = document.querySelector('.chat-messages');
        if (!container || !history.length) return;
        
        container.innerHTML = '';
        
        history.forEach(msg => {
            this._appendMessage(msg.role, msg.content, msg.engine, false);
        });
        
        container.scrollTop = container.scrollHeight;
    },
    
    /**
     * Restore uploaded assets
     */
    _restoreUploadedAssets(assets) {
        if (!assets.length) return;
        window.uploadedFiles = assets;
        if (typeof updateAttachedFilesBar === 'function') {
            updateAttachedFilesBar();
        }
    },
    
    /**
     * Append message to chat
     */
    _appendMessage(role, content, engine = null, animate = true) {
        const container = document.querySelector('.chat-messages');
        if (!container) return;
        
        const engineInfo = engine ? FRONTIER_ENGINES[engine] : null;
        const engineBadge = engineInfo 
            ? `<span class="engine-badge" style="color: ${engineInfo.color}">${engineInfo.icon} ${engineInfo.displayName}</span>`
            : '';
        
        const div = document.createElement('div');
        div.className = `message ${role}-message ${animate ? 'animate-fade-in' : ''}`;
        div.innerHTML = `
            <div class="message-content">
                ${role === 'assistant' ? `<div class="ai-icon">🧠</div>` : ''}
                <div class="message-body">
                    ${role === 'assistant' ? engineBadge : ''}
                    <div class="message-text">${this._formatMessage(content)}</div>
                </div>
            </div>
        `;
        
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },
    
    /**
     * Format message with markdown
     */
    _formatMessage(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');
    },
    
    /**
     * Show typing indicator with engine info
     */
    _showTypingIndicator(engineId) {
        const container = document.querySelector('.chat-messages');
        if (!container) return;
        
        const engine = FRONTIER_ENGINES[engineId];
        
        const indicator = document.createElement('div');
        indicator.id = 'typing-indicator';
        indicator.className = 'message assistant-message';
        indicator.innerHTML = `
            <div class="message-content">
                <div class="ai-icon">🧠</div>
                <div class="message-body">
                    <span class="engine-badge" style="color: ${engine.color}">${engine.icon} ${engine.displayName}</span>
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(indicator);
        container.scrollTop = container.scrollHeight;
    },
    
    /**
     * Hide typing indicator
     */
    _hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
    },
    
    /**
     * Update metrics display
     */
    _updateMetricsDisplay(metrics) {
        const el = document.getElementById('session-metrics');
        if (!el) return;
        
        el.innerHTML = `
            <div class="metric">
                <span class="metric-label">Requests</span>
                <span class="metric-value">${metrics.requestCount}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Cost</span>
                <span class="metric-value">$${metrics.totalCost.toFixed(4)}</span>
            </div>
            <div class="metric">
                <span class="metric-label">Latency</span>
                <span class="metric-value">${Math.round(metrics.totalLatency / Math.max(1, metrics.requestCount))}ms</span>
            </div>
        `;
    },
    
    /**
     * Show error message
     */
    _showError(message) {
        this._appendMessage('assistant', `⚠️ ${message}`, null);
    },
    
    /**
     * Show strategy trigger button
     */
    _showStrategyTrigger() {
        const container = document.querySelector('.intake-actions');
        if (!container) return;
        
        container.innerHTML = `
            <button onclick="GenesisIntake.streamStrategy()" class="strategy-btn pulse-glow">
                <span class="btn-icon">🚀</span>
                Generate AI Strategy with Claude 4.5
            </button>
        `;
    },
    
    /**
     * Show strategy loading state
     */
    _showStrategyLoading(engineId) {
        const engine = FRONTIER_ENGINES[engineId];
        const container = document.getElementById('strategy-container');
        if (!container) return;
        
        container.innerHTML = `
            <div class="strategy-loading">
                <div class="loading-spinner" style="border-color: ${engine.color}"></div>
                <div class="loading-text">
                    ${engine.icon} ${engine.displayName} is synthesizing your strategy...
                </div>
                <div class="loading-subtext">Using ${engine.strength}</div>
            </div>
        `;
        container.style.display = 'block';
    },
    
    /**
     * Hide strategy loading
     */
    _hideStrategyLoading() {
        const loader = document.querySelector('.strategy-loading');
        if (loader) loader.remove();
    },
    
    /**
     * Display generated strategy
     */
    _displayStrategy(data) {
        const container = document.getElementById('strategy-container');
        if (!container) return;
        
        const engine = FRONTIER_ENGINES[data.engine_used] || FRONTIER_ENGINES.claude_sonnet_45;
        
        container.innerHTML = `
            <div class="strategy-header">
                <h2>🎯 Your AI Commercial Strategy</h2>
                <div class="strategy-meta">
                    <span class="engine-badge" style="color: ${engine.color}">
                        ${engine.icon} Generated by ${engine.displayName}
                    </span>
                    <span class="meta-item">⚡ ${data.latency_ms}ms</span>
                    <span class="meta-item">💰 $${data.cost_usd.toFixed(4)}</span>
                    ${data.thinking_tokens ? `<span class="meta-item">🧠 ${data.thinking_tokens} thinking tokens</span>` : ''}
                </div>
            </div>
            <div class="strategy-content" id="strategy-content">
                ${this._formatMessage(data.strategy)}
            </div>
        `;
    }
};


// =============================================================================
// ENGINE HUD COMPONENT
// =============================================================================

const EngineHUD = {
    /**
     * Render the engine selector HUD
     */
    render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const currentEngine = GenesisSession.getActiveEngine();
        
        container.innerHTML = `
            <div class="engine-hud">
                <div class="hud-title">🧠 REASONING ENGINE</div>
                <div class="engine-options">
                    ${Object.values(FRONTIER_ENGINES).map(engine => `
                        <button 
                            class="engine-option ${engine.id === currentEngine.id ? 'active' : ''}"
                            data-engine="${engine.id}"
                            onclick="EngineHUD.select('${engine.id}')"
                            style="${engine.id === currentEngine.id ? `border-color: ${engine.color}; box-shadow: 0 0 20px ${engine.glowColor}` : ''}"
                        >
                            <div class="engine-icon">${engine.icon}</div>
                            <div class="engine-info">
                                <div class="engine-name">${engine.displayName}</div>
                                <div class="engine-strength">${engine.strength}</div>
                            </div>
                            <div class="engine-cost">${engine.costIndicator}</div>
                        </button>
                    `).join('')}
                </div>
                <div class="brain-profile" id="brain-profile"></div>
            </div>
        `;
        
        // Update profile display
        GenesisSession._updateEngineHUD(currentEngine.id);
    },
    
    /**
     * Select an engine
     */
    select(engineId) {
        GenesisSession.setEngine(engineId);
        
        // Re-render to update active states
        const container = document.querySelector('.engine-hud');
        if (container) {
            this.render(container.parentElement.id);
        }
    }
};


// =============================================================================
// AUTO-INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize session with engine recovery
    GenesisSession.init();
    
    // Initialize intake UI
    GenesisIntake.init();
    
    // Render Engine HUD if container exists
    const hudContainer = document.getElementById('engine-hud-container');
    if (hudContainer) {
        EngineHUD.render('engine-hud-container');
    }
    
    console.log('[Genesis v3] Legendary Reasoning Engine initialized');
});


// =============================================================================
// EXPORTS
// =============================================================================

window.GenesisSession = GenesisSession;
window.GenesisIntake = GenesisIntake;
window.EngineHUD = EngineHUD;
window.FRONTIER_ENGINES = FRONTIER_ENGINES;
