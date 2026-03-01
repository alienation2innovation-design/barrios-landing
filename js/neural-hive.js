/**
 * ================================================================================
 * NEURAL HIVE v1.0 - 23-Agent Real-Time Monitoring Dashboard
 * ================================================================================
 * Visualizes the full RAGNAROK v4.0 LEGENDARY 23-agent pipeline
 * Connects to GENESIS SSE for real-time agent status updates
 *
 * Agent Categories:
 * - Pre-generation (4): Agents 13, 14, 15, 11
 * - Core (8): Agents 0, 0.5, 1, 2, 3, 4, 5, 6, 7
 * - Enhancement (5): Agents 0.75, 1.5, 3.5, 5.5, 6.5
 * - Post-generation (2): Agents 7.5, 12
 * - Evolution (4): Agents 8, 8.5, 9, 10
 *
 * Author: Barrios A2I | RAGNAROK v4.0 LEGENDARY | January 2026
 * ================================================================================
 */

(function() {
    'use strict';

    // =============================================================================
    // 23-AGENT REGISTRY - RAGNAROK v4.0 LEGENDARY
    // =============================================================================

    const NEURAL_HIVE_AGENTS = {
        // ═══════════════════════════════════════════════════════════════════════
        // PRE-GENERATION AGENTS (Research & Intelligence)
        // ═══════════════════════════════════════════════════════════════════════
        'agent_13': {
            id: 'agent_13',
            number: '13',
            codename: 'THE MEMORY',
            name: 'Client DNA System',
            category: 'pre-generation',
            description: 'Retrieves client preferences and historical patterns',
            estimatedCost: 0.01,
            estimatedTime: 2,
            icon: '🧬',
            color: '#8B5CF6',
            dependencies: []
        },
        'agent_14': {
            id: 'agent_14',
            number: '14',
            codename: 'THE HUNTER',
            name: 'Real-Time Trend Radar',
            category: 'pre-generation',
            description: 'Scans current market trends and viral content',
            estimatedCost: 0.02,
            estimatedTime: 3,
            icon: '🎯',
            color: '#EC4899',
            dependencies: []
        },
        'agent_15': {
            id: 'agent_15',
            number: '15',
            codename: 'THE ACCOUNTANT',
            name: 'Dynamic Budget Optimizer',
            category: 'pre-generation',
            description: 'Optimizes resource allocation based on budget',
            estimatedCost: 0.01,
            estimatedTime: 1,
            icon: '💰',
            color: '#F59E0B',
            dependencies: []
        },
        'agent_11': {
            id: 'agent_11',
            number: '11',
            codename: 'THE ORACLE',
            name: 'Viral Potential Predictor',
            category: 'pre-generation',
            description: 'Predicts viral potential of content strategies',
            estimatedCost: 0.03,
            estimatedTime: 4,
            icon: '🔮',
            color: '#6366F1',
            dependencies: ['agent_13', 'agent_14']
        },

        // ═══════════════════════════════════════════════════════════════════════
        // CORE PIPELINE AGENTS (Production)
        // ═══════════════════════════════════════════════════════════════════════
        'agent_0': {
            id: 'agent_0',
            number: '0',
            codename: 'NEXUS',
            name: 'Intake Gateway',
            category: 'core',
            description: 'Receives and validates commercial brief',
            estimatedCost: 0.00,
            estimatedTime: 1,
            icon: '🚀',
            color: '#00CED1',
            dependencies: []
        },
        'agent_0.5': {
            id: 'agent_0.5',
            number: '0.5',
            codename: 'CURATOR',
            name: 'Commercial Curator',
            category: 'core',
            description: 'RAG retrieval from commercial database',
            estimatedCost: 0.20,
            estimatedTime: 5,
            icon: '📚',
            color: '#00CED1',
            dependencies: ['agent_0']
        },
        'agent_1': {
            id: 'agent_1',
            number: '1',
            codename: 'STRATEGIST',
            name: 'Strategy Director',
            category: 'core',
            description: 'Creates commercial strategy and positioning',
            estimatedCost: 0.05,
            estimatedTime: 8,
            icon: '🎖️',
            color: '#10B981',
            dependencies: ['agent_0.5', 'agent_11']
        },
        'agent_2': {
            id: 'agent_2',
            number: '2',
            codename: 'STORYTELLER',
            name: 'Story Creator',
            category: 'core',
            description: 'Crafts narrative arc and emotional hooks',
            estimatedCost: 0.05,
            estimatedTime: 10,
            icon: '📖',
            color: '#10B981',
            dependencies: ['agent_1']
        },
        'agent_3': {
            id: 'agent_3',
            number: '3',
            codename: 'ARCHITECT',
            name: 'Prompt Engineer',
            category: 'core',
            description: 'Generates video prompts for KIE.ai',
            estimatedCost: 0.09,
            estimatedTime: 12,
            icon: '🏗️',
            color: '#8B5CF6',
            dependencies: ['agent_2']
        },
        'agent_4': {
            id: 'agent_4',
            number: '4',
            codename: 'RENDERER',
            name: 'Video Generator',
            category: 'core',
            description: 'KIE.ai video generation (main cost)',
            estimatedCost: 1.50,
            estimatedTime: 120,
            icon: '🎬',
            color: '#EF4444',
            dependencies: ['agent_3']
        },
        'agent_5': {
            id: 'agent_5',
            number: '5',
            codename: 'VOICE',
            name: 'Voice Synthesizer',
            category: 'core',
            description: 'ElevenLabs voice-over generation',
            estimatedCost: 0.03,
            estimatedTime: 15,
            icon: '🎤',
            color: '#F59E0B',
            dependencies: ['agent_2']
        },
        'agent_6': {
            id: 'agent_6',
            number: '6',
            codename: 'VORTEX',
            name: 'Assembly Engine',
            category: 'core',
            description: 'FFmpeg video assembly and post-production',
            estimatedCost: 0.00,
            estimatedTime: 30,
            icon: '⚡',
            color: '#00CED1',
            dependencies: ['agent_4', 'agent_5']
        },
        'agent_7': {
            id: 'agent_7',
            number: '7',
            codename: 'CRITIC',
            name: 'Quality Assurance',
            category: 'core',
            description: 'FFprobe QA validation',
            estimatedCost: 0.00,
            estimatedTime: 5,
            icon: '✅',
            color: '#10B981',
            dependencies: ['agent_6']
        },

        // ═══════════════════════════════════════════════════════════════════════
        // ENHANCEMENT AGENTS (Optimization)
        // ═══════════════════════════════════════════════════════════════════════
        'agent_0.75': {
            id: 'agent_0.75',
            number: '0.75',
            codename: 'SCOUT',
            name: 'Competitive Intelligence',
            category: 'enhancement',
            description: 'Market differentiation analysis',
            estimatedCost: 0.03,
            estimatedTime: 4,
            icon: '🔍',
            color: '#06B6D4',
            dependencies: ['agent_0.5']
        },
        'agent_1.5': {
            id: 'agent_1.5',
            number: '1.5',
            codename: 'VALIDATOR',
            name: 'Narrative Arc Validator',
            category: 'enhancement',
            description: 'Validates audience resonance',
            estimatedCost: 0.003,
            estimatedTime: 3,
            icon: '📊',
            color: '#06B6D4',
            dependencies: ['agent_2']
        },
        'agent_3.5': {
            id: 'agent_3.5',
            number: '3.5',
            codename: 'MUTATOR',
            name: 'Prompt Mutation Engine',
            category: 'enhancement',
            description: 'Multi-variant prompt testing',
            estimatedCost: 0.005,
            estimatedTime: 5,
            icon: '🧪',
            color: '#06B6D4',
            dependencies: ['agent_3']
        },
        'agent_5.5': {
            id: 'agent_5.5',
            number: '5.5',
            codename: 'SONIC',
            name: 'Sonic Branding',
            category: 'enhancement',
            description: 'Voice and music consistency',
            estimatedCost: 0.005,
            estimatedTime: 3,
            icon: '🎵',
            color: '#06B6D4',
            dependencies: ['agent_5']
        },
        'agent_6.5': {
            id: 'agent_6.5',
            number: '6.5',
            codename: 'COMPLIANCE',
            name: 'Cultural Compliance',
            category: 'enhancement',
            description: 'Legal and cultural safety validation',
            estimatedCost: 0.01,
            estimatedTime: 4,
            icon: '🛡️',
            color: '#06B6D4',
            dependencies: ['agent_6']
        },

        // ═══════════════════════════════════════════════════════════════════════
        // POST-GENERATION AGENTS (Quality & Adaptation)
        // ═══════════════════════════════════════════════════════════════════════
        'agent_7.5': {
            id: 'agent_7.5',
            number: '7.5',
            codename: 'AUTEUR',
            name: 'Creative QA (Vision)',
            category: 'post-generation',
            description: 'Vision-language creative quality analysis',
            estimatedCost: 0.02,
            estimatedTime: 8,
            icon: '👁️',
            color: '#A855F7',
            dependencies: ['agent_7']
        },
        'agent_12': {
            id: 'agent_12',
            number: '12',
            codename: 'CHAMELEON',
            name: 'Multi-Platform Optimizer',
            category: 'post-generation',
            description: 'Adapts content for different platforms',
            estimatedCost: 0.02,
            estimatedTime: 10,
            icon: '🦎',
            color: '#A855F7',
            dependencies: ['agent_7.5']
        },

        // ═══════════════════════════════════════════════════════════════════════
        // EVOLUTION AGENTS (Learning & Improvement)
        // ═══════════════════════════════════════════════════════════════════════
        'agent_8': {
            id: 'agent_8',
            number: '8',
            codename: 'HISTORIAN',
            name: 'Meta-Learning Optimizer',
            category: 'evolution',
            description: 'Learns from historical performance data',
            estimatedCost: 0.00,
            estimatedTime: 2,
            icon: '📜',
            color: '#84CC16',
            dependencies: []
        },
        'agent_8.5': {
            id: 'agent_8.5',
            number: '8.5',
            codename: 'GENETICIST',
            name: 'DSPy Prompt Evolution',
            category: 'evolution',
            description: 'Self-optimizing prompt genetics',
            estimatedCost: 0.01,
            estimatedTime: 5,
            icon: '🧬',
            color: '#84CC16',
            dependencies: ['agent_8']
        },
        'agent_9': {
            id: 'agent_9',
            number: '9',
            codename: 'SCIENTIST',
            name: 'A/B Testing Orchestrator',
            category: 'evolution',
            description: 'Statistical testing and variant selection',
            estimatedCost: 0.005,
            estimatedTime: 3,
            icon: '🔬',
            color: '#84CC16',
            dependencies: ['agent_12']
        },
        'agent_10': {
            id: 'agent_10',
            number: '10',
            codename: 'LISTENER',
            name: 'Feedback Integrator',
            category: 'evolution',
            description: 'Client feedback loop processing',
            estimatedCost: 0.01,
            estimatedTime: 2,
            icon: '👂',
            color: '#84CC16',
            dependencies: ['agent_9']
        }
    };

    // Category colors and order
    const CATEGORY_CONFIG = {
        'pre-generation': {
            label: 'PRE-GEN',
            color: '#8B5CF6',
            bgColor: 'rgba(139, 92, 246, 0.1)',
            order: 1
        },
        'core': {
            label: 'CORE',
            color: '#00CED1',
            bgColor: 'rgba(0, 206, 209, 0.1)',
            order: 2
        },
        'enhancement': {
            label: 'ENHANCE',
            color: '#06B6D4',
            bgColor: 'rgba(6, 182, 212, 0.1)',
            order: 3
        },
        'post-generation': {
            label: 'POST-GEN',
            color: '#A855F7',
            bgColor: 'rgba(168, 85, 247, 0.1)',
            order: 4
        },
        'evolution': {
            label: 'EVOLVE',
            color: '#84CC16',
            bgColor: 'rgba(132, 204, 22, 0.1)',
            order: 5
        }
    };

    // Status colors
    const STATUS_COLORS = {
        idle: { bg: 'rgba(255, 255, 255, 0.05)', border: 'rgba(255, 255, 255, 0.1)', text: '#a1a1aa' },
        running: { bg: 'rgba(0, 206, 209, 0.15)', border: '#00CED1', text: '#00CED1' },
        complete: { bg: 'rgba(16, 185, 129, 0.15)', border: '#10B981', text: '#10B981' },
        failed: { bg: 'rgba(239, 68, 68, 0.15)', border: '#EF4444', text: '#EF4444' },
        skipped: { bg: 'rgba(107, 114, 128, 0.1)', border: '#6B7280', text: '#6B7280' }
    };

    // =============================================================================
    // NEURAL HIVE STATE MANAGER
    // =============================================================================

    const NeuralHiveState = {
        isVisible: false,
        isConnected: false,
        pipelineId: null,
        eventSource: null,
        agents: {},
        totalCost: 0,
        progress: 0,
        startTime: null,

        // Initialize agent states
        init() {
            Object.keys(NEURAL_HIVE_AGENTS).forEach(agentId => {
                this.agents[agentId] = {
                    status: 'idle',
                    startTime: null,
                    endTime: null,
                    cost: null,
                    output: null
                };
            });
        },

        // Reset all agents to idle
        reset() {
            this.init();
            this.totalCost = 0;
            this.progress = 0;
            this.startTime = null;
        },

        // Update agent status
        updateAgent(agentId, status, data = {}) {
            if (!this.agents[agentId]) return;

            this.agents[agentId] = {
                ...this.agents[agentId],
                status,
                ...data
            };

            // Recalculate total cost
            if (data.cost) {
                this.totalCost = Object.values(this.agents)
                    .reduce((sum, a) => sum + (a.cost || 0), 0);
            }

            // Recalculate progress
            const completed = Object.values(this.agents)
                .filter(a => a.status === 'complete' || a.status === 'skipped').length;
            this.progress = Math.round((completed / Object.keys(this.agents).length) * 100);
        }
    };

    // Initialize state
    NeuralHiveState.init();

    // =============================================================================
    // SSE CONNECTION TO GENESIS
    // =============================================================================

    const GENESIS_URL = 'https://api.barriosa2i.com';

    function connectToGenesis(pipelineId) {
        if (NeuralHiveState.eventSource) {
            NeuralHiveState.eventSource.close();
        }

        NeuralHiveState.pipelineId = pipelineId;
        NeuralHiveState.startTime = Date.now();
        NeuralHiveState.reset();

        const url = `${GENESIS_URL}/api/genesis/stream/${pipelineId}`;
        console.log('[NeuralHive] Connecting to SSE:', url);

        const eventSource = new EventSource(url);
        NeuralHiveState.eventSource = eventSource;

        eventSource.onopen = () => {
            console.log('[NeuralHive] SSE Connected');
            NeuralHiveState.isConnected = true;
            updateConnectionStatus(true);
        };

        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleGenesisEvent(data);
            } catch (e) {
                console.error('[NeuralHive] Parse error:', e);
            }
        };

        eventSource.onerror = (err) => {
            console.error('[NeuralHive] SSE Error:', err);
            NeuralHiveState.isConnected = false;
            updateConnectionStatus(false);

            // Attempt reconnect after 5s
            setTimeout(() => {
                if (NeuralHiveState.pipelineId) {
                    connectToGenesis(NeuralHiveState.pipelineId);
                }
            }, 5000);
        };

        // Handle specific event types
        eventSource.addEventListener('AGENT_START', (event) => {
            const data = JSON.parse(event.data);
            handleAgentStart(data);
        });

        eventSource.addEventListener('AGENT_COMPLETE', (event) => {
            const data = JSON.parse(event.data);
            handleAgentComplete(data);
        });

        eventSource.addEventListener('PIPELINE_COMPLETE', (event) => {
            const data = JSON.parse(event.data);
            handlePipelineComplete(data);
        });

        eventSource.addEventListener('PIPELINE_ERROR', (event) => {
            const data = JSON.parse(event.data);
            handlePipelineError(data);
        });
    }

    function disconnectFromGenesis() {
        if (NeuralHiveState.eventSource) {
            NeuralHiveState.eventSource.close();
            NeuralHiveState.eventSource = null;
        }
        NeuralHiveState.isConnected = false;
        NeuralHiveState.pipelineId = null;
        updateConnectionStatus(false);
    }

    // =============================================================================
    // EVENT HANDLERS
    // =============================================================================

    function handleGenesisEvent(data) {
        const { type, agent_id, agent_name, phase, progress } = data;

        // Map agent names/ids to our registry
        const agentKey = mapAgentToKey(agent_id, agent_name);

        if (type === 'agent_started' || type === 'AGENT_START') {
            NeuralHiveState.updateAgent(agentKey, 'running', {
                startTime: Date.now()
            });
        } else if (type === 'agent_completed' || type === 'AGENT_COMPLETE') {
            NeuralHiveState.updateAgent(agentKey, 'complete', {
                endTime: Date.now(),
                cost: data.cost || NEURAL_HIVE_AGENTS[agentKey]?.estimatedCost || 0
            });
        } else if (type === 'agent_failed' || type === 'AGENT_ERROR') {
            NeuralHiveState.updateAgent(agentKey, 'failed', {
                endTime: Date.now(),
                error: data.error
            });
        }

        // Update UI
        renderNeuralHive();
    }

    function handleAgentStart(data) {
        const agentKey = mapAgentToKey(data.agent_id, data.agent_name);
        NeuralHiveState.updateAgent(agentKey, 'running', {
            startTime: Date.now()
        });
        renderNeuralHive();
    }

    function handleAgentComplete(data) {
        const agentKey = mapAgentToKey(data.agent_id, data.agent_name);
        NeuralHiveState.updateAgent(agentKey, 'complete', {
            endTime: Date.now(),
            cost: data.cost || NEURAL_HIVE_AGENTS[agentKey]?.estimatedCost || 0,
            output: data.output
        });
        renderNeuralHive();
    }

    function handlePipelineComplete(data) {
        console.log('[NeuralHive] Pipeline complete:', data);
        disconnectFromGenesis();
        showCompletionAnimation();
    }

    function handlePipelineError(data) {
        console.error('[NeuralHive] Pipeline error:', data);
        // Mark remaining running agents as failed
        Object.keys(NeuralHiveState.agents).forEach(agentId => {
            if (NeuralHiveState.agents[agentId].status === 'running') {
                NeuralHiveState.updateAgent(agentId, 'failed', {
                    error: data.error
                });
            }
        });
        renderNeuralHive();
    }

    // Map various agent identifiers to our registry keys
    function mapAgentToKey(agentId, agentName) {
        // Direct match
        if (NEURAL_HIVE_AGENTS[agentId]) return agentId;
        if (NEURAL_HIVE_AGENTS[`agent_${agentId}`]) return `agent_${agentId}`;

        // Name-based mapping
        const nameMappings = {
            'commercial curator': 'agent_0.5',
            'curator': 'agent_0.5',
            'strategy director': 'agent_1',
            'strategist': 'agent_1',
            'story creator': 'agent_2',
            'storyteller': 'agent_2',
            'prompt engineer': 'agent_3',
            'architect': 'agent_3',
            'video generator': 'agent_4',
            'renderer': 'agent_4',
            'voice synthesizer': 'agent_5',
            'voice': 'agent_5',
            'vortex': 'agent_6',
            'assembly': 'agent_6',
            'critic': 'agent_7',
            'qa': 'agent_7',
            'competitive intelligence': 'agent_0.75',
            'scout': 'agent_0.75',
            'narrative validator': 'agent_1.5',
            'validator': 'agent_1.5',
            'prompt mutation': 'agent_3.5',
            'mutator': 'agent_3.5',
            'sonic branding': 'agent_5.5',
            'sonic': 'agent_5.5',
            'compliance': 'agent_6.5',
            'auteur': 'agent_7.5',
            'creative qa': 'agent_7.5',
            'meta-learning': 'agent_8',
            'historian': 'agent_8',
            'geneticist': 'agent_8.5',
            'dspy': 'agent_8.5',
            'a/b testing': 'agent_9',
            'scientist': 'agent_9',
            'feedback': 'agent_10',
            'listener': 'agent_10',
            'oracle': 'agent_11',
            'viral': 'agent_11',
            'chameleon': 'agent_12',
            'platform': 'agent_12',
            'memory': 'agent_13',
            'client dna': 'agent_13',
            'hunter': 'agent_14',
            'trend': 'agent_14',
            'accountant': 'agent_15',
            'budget': 'agent_15'
        };

        const lowerName = (agentName || '').toLowerCase();
        for (const [key, value] of Object.entries(nameMappings)) {
            if (lowerName.includes(key)) return value;
        }

        return agentId;
    }

    // =============================================================================
    // UI RENDERING
    // =============================================================================

    function renderNeuralHive() {
        const container = document.getElementById('neural-hive-container');
        if (!container) return;

        // Group agents by category
        const agentsByCategory = {};
        Object.entries(NEURAL_HIVE_AGENTS).forEach(([id, agent]) => {
            if (!agentsByCategory[agent.category]) {
                agentsByCategory[agent.category] = [];
            }
            agentsByCategory[agent.category].push({ id, ...agent });
        });

        // Sort categories by order
        const sortedCategories = Object.entries(agentsByCategory)
            .sort((a, b) => CATEGORY_CONFIG[a[0]].order - CATEGORY_CONFIG[b[0]].order);

        // Build HTML
        let html = `
            <div class="neural-hive-header">
                <div class="neural-hive-title">
                    <span class="neural-hive-icon">🧠</span>
                    <span>NEURAL HIVE</span>
                    <span class="neural-hive-badge">${Object.keys(NEURAL_HIVE_AGENTS).length} AGENTS</span>
                </div>
                <div class="neural-hive-stats">
                    <div class="neural-hive-stat">
                        <span class="stat-label">PROGRESS</span>
                        <span class="stat-value">${NeuralHiveState.progress}%</span>
                    </div>
                    <!-- COST display removed - internal business data -->
                    <div class="neural-hive-stat neural-hive-connection ${NeuralHiveState.isConnected ? 'connected' : ''}">
                        <span class="connection-dot"></span>
                        <span class="stat-label">${NeuralHiveState.isConnected ? 'LIVE' : 'OFFLINE'}</span>
                    </div>
                </div>
            </div>

            <div class="neural-hive-progress">
                <div class="neural-hive-progress-bar" style="width: ${NeuralHiveState.progress}%"></div>
            </div>

            <div class="neural-hive-grid">
        `;

        // Render each category
        sortedCategories.forEach(([category, agents]) => {
            const config = CATEGORY_CONFIG[category];
            html += `
                <div class="neural-hive-category" style="--category-color: ${config.color}">
                    <div class="category-header">
                        <span class="category-label">${config.label}</span>
                        <span class="category-count">${agents.length}</span>
                    </div>
                    <div class="category-agents">
            `;

            agents.forEach(agent => {
                const state = NeuralHiveState.agents[agent.id] || { status: 'idle' };
                const statusColors = STATUS_COLORS[state.status];
                const isRunning = state.status === 'running';

                html += `
                    <div class="agent-node ${state.status}"
                         style="--agent-color: ${agent.color}; --status-bg: ${statusColors.bg}; --status-border: ${statusColors.border}"
                         data-agent-id="${agent.id}"
                         title="${agent.codename}: ${agent.name}">
                        <div class="agent-icon ${isRunning ? 'pulse' : ''}">${agent.icon}</div>
                        <div class="agent-info">
                            <div class="agent-number">${agent.number}</div>
                            <div class="agent-codename">${agent.codename}</div>
                        </div>
                        ${state.status === 'complete' ? '<div class="agent-checkmark">✓</div>' : ''}
                        ${state.status === 'failed' ? '<div class="agent-error">✗</div>' : ''}
                        ${isRunning ? '<div class="agent-spinner"></div>' : ''}
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    function updateConnectionStatus(connected) {
        const statusEl = document.querySelector('.neural-hive-connection');
        if (statusEl) {
            statusEl.classList.toggle('connected', connected);
            statusEl.querySelector('.stat-label').textContent = connected ? 'LIVE' : 'OFFLINE';
        }
    }

    function showCompletionAnimation() {
        const container = document.getElementById('neural-hive-container');
        if (!container) return;

        container.classList.add('complete');
        setTimeout(() => container.classList.remove('complete'), 2000);
    }

    // =============================================================================
    // TOGGLE VISIBILITY
    // =============================================================================

    function toggleNeuralHive() {
        NeuralHiveState.isVisible = !NeuralHiveState.isVisible;
        const container = document.getElementById('neural-hive-container');
        const toggle = document.getElementById('neural-hive-toggle');

        if (container) {
            container.classList.toggle('visible', NeuralHiveState.isVisible);
        }
        if (toggle) {
            toggle.classList.toggle('active', NeuralHiveState.isVisible);
        }
    }

    // =============================================================================
    // DEMO MODE (for testing without backend)
    // =============================================================================

    function runDemoMode() {
        console.log('[NeuralHive] Running demo mode...');
        NeuralHiveState.reset();
        NeuralHiveState.isConnected = true;
        NeuralHiveState.startTime = Date.now();

        // Simulate agents running in sequence
        const agentOrder = [
            'agent_13', 'agent_14', 'agent_15', 'agent_11',  // Pre-gen
            'agent_0', 'agent_0.5', 'agent_0.75',            // Early core + enhancement
            'agent_1', 'agent_2', 'agent_1.5',              // Strategy + story + validation
            'agent_3', 'agent_3.5', 'agent_4',              // Prompts + mutation + video
            'agent_5', 'agent_5.5',                         // Voice + sonic
            'agent_6', 'agent_6.5', 'agent_7',              // Assembly + compliance + QA
            'agent_7.5', 'agent_12',                        // Post-gen
            'agent_8', 'agent_8.5', 'agent_9', 'agent_10'   // Evolution
        ];

        let index = 0;
        const interval = setInterval(() => {
            if (index >= agentOrder.length) {
                clearInterval(interval);
                NeuralHiveState.isConnected = false;
                renderNeuralHive();
                showCompletionAnimation();
                return;
            }

            const agentId = agentOrder[index];
            const agent = NEURAL_HIVE_AGENTS[agentId];

            // Start agent
            NeuralHiveState.updateAgent(agentId, 'running', {
                startTime: Date.now()
            });
            renderNeuralHive();

            // Complete after estimated time (sped up for demo)
            setTimeout(() => {
                NeuralHiveState.updateAgent(agentId, 'complete', {
                    endTime: Date.now(),
                    cost: agent.estimatedCost
                });
                renderNeuralHive();
            }, Math.min(agent.estimatedTime * 50, 2000));

            index++;
        }, 500);
    }

    // =============================================================================
    // INJECT CSS STYLES
    // =============================================================================

    function injectStyles() {
        if (document.getElementById('neural-hive-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'neural-hive-styles';
        styles.textContent = `
            /* Neural Hive Container - LEFT side to avoid NI chat overlap */
            #neural-hive-container {
                position: fixed;
                bottom: 80px;
                left: 20px;
                width: 420px;
                max-width: calc(100vw - 40px);
                max-height: calc(100vh - 120px);
                overflow-y: auto;
                display: none;
                flex-direction: column;
                gap: 12px;
                padding: 16px;
                background: rgba(10, 10, 30, 0.98);
                backdrop-filter: blur(20px);
                border: 1px solid rgba(139, 92, 246, 0.3);
                border-radius: 12px;
                opacity: 0;
                transform: translateY(20px) scale(0.95);
                transition: opacity 0.3s ease, transform 0.3s ease;
                z-index: 9996;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 30px rgba(139, 92, 246, 0.1);
            }

            #neural-hive-container.visible {
                display: flex;
                opacity: 1;
                transform: translateY(0) scale(1);
            }

            #neural-hive-container.complete {
                animation: hive-complete 0.5s ease;
            }

            @keyframes hive-complete {
                0%, 100% { box-shadow: 0 0 0 rgba(16, 185, 129, 0); }
                50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.5); }
            }

            /* Header */
            .neural-hive-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 12px;
            }

            .neural-hive-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 14px;
                font-weight: 600;
                color: #fafafa;
            }

            .neural-hive-icon {
                font-size: 18px;
            }

            .neural-hive-badge {
                font-size: 10px;
                font-family: 'JetBrains Mono', monospace;
                padding: 2px 8px;
                background: rgba(0, 206, 209, 0.15);
                border: 1px solid rgba(0, 206, 209, 0.3);
                border-radius: 10px;
                color: #00CED1;
            }

            .neural-hive-stats {
                display: flex;
                gap: 16px;
            }

            .neural-hive-stat {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
            }

            .neural-hive-stat .stat-label {
                font-size: 9px;
                color: #a1a1aa;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .neural-hive-stat .stat-value {
                font-size: 14px;
                font-family: 'JetBrains Mono', monospace;
                color: #00CED1;
                font-weight: 600;
            }

            .neural-hive-connection {
                flex-direction: row !important;
                gap: 6px !important;
            }

            .connection-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #6B7280;
                transition: background 0.3s ease;
            }

            .neural-hive-connection.connected .connection-dot {
                background: #10B981;
                box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
            }

            /* Progress Bar */
            .neural-hive-progress {
                height: 3px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                overflow: hidden;
            }

            .neural-hive-progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #00CED1, #8B5CF6);
                border-radius: 2px;
                transition: width 0.5s ease;
            }

            /* Grid */
            .neural-hive-grid {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            /* Category */
            .neural-hive-category {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .category-header {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .category-label {
                font-size: 10px;
                font-weight: 600;
                color: var(--category-color);
                text-transform: uppercase;
                letter-spacing: 0.1em;
            }

            .category-count {
                font-size: 9px;
                font-family: 'JetBrains Mono', monospace;
                padding: 1px 6px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                color: #a1a1aa;
            }

            .category-agents {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
            }

            /* Agent Node */
            .agent-node {
                position: relative;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: var(--status-bg);
                border: 1px solid var(--status-border);
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .agent-node:hover {
                transform: scale(1.02);
                border-color: var(--agent-color);
                box-shadow: 0 0 20px rgba(0, 206, 209, 0.1);
            }

            .agent-node.running {
                border-color: #00CED1;
                box-shadow: 0 0 15px rgba(0, 206, 209, 0.3);
            }

            .agent-node.complete {
                border-color: #10B981;
            }

            .agent-node.failed {
                border-color: #EF4444;
            }

            .agent-icon {
                font-size: 18px;
                line-height: 1;
            }

            .agent-icon.pulse {
                animation: icon-pulse 1.5s ease-in-out infinite;
            }

            @keyframes icon-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.8; }
            }

            .agent-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }

            .agent-number {
                font-size: 10px;
                font-family: 'JetBrains Mono', monospace;
                color: #a1a1aa;
            }

            .agent-codename {
                font-size: 11px;
                font-weight: 500;
                color: #fafafa;
            }

            .agent-checkmark {
                position: absolute;
                top: -4px;
                right: -4px;
                width: 14px;
                height: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #10B981;
                border-radius: 50%;
                font-size: 8px;
                color: white;
            }

            .agent-error {
                position: absolute;
                top: -4px;
                right: -4px;
                width: 14px;
                height: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: #EF4444;
                border-radius: 50%;
                font-size: 8px;
                color: white;
            }

            .agent-spinner {
                position: absolute;
                top: -4px;
                right: -4px;
                width: 14px;
                height: 14px;
                border: 2px solid rgba(0, 206, 209, 0.3);
                border-top-color: #00CED1;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                to { transform: rotate(360deg); }
            }

            /* Neural Hive Toggle - LEFT side to avoid NI chat FAB overlap */
            #neural-hive-toggle {
                position: fixed;
                bottom: 20px;
                left: 20px;
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 12px 16px;
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(0, 206, 209, 0.1));
                border: 1px solid rgba(139, 92, 246, 0.4);
                border-radius: 30px;
                color: #a1a1aa;
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 0.05em;
                cursor: pointer;
                transition: all 0.3s ease;
                z-index: 9997;
                box-shadow: 0 4px 20px rgba(139, 92, 246, 0.2);
            }

            #neural-hive-toggle:hover {
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(0, 206, 209, 0.2));
                border-color: #8B5CF6;
                color: #fafafa;
                transform: scale(1.05);
                box-shadow: 0 6px 30px rgba(139, 92, 246, 0.3);
            }

            #neural-hive-toggle.active {
                background: linear-gradient(135deg, rgba(139, 92, 246, 0.4), rgba(0, 206, 209, 0.3));
                border-color: #00CED1;
                color: #00CED1;
                box-shadow: 0 0 20px rgba(0, 206, 209, 0.3);
            }

            #neural-hive-toggle .toggle-icon {
                font-size: 18px;
            }

            #neural-hive-toggle .toggle-text {
                font-family: 'JetBrains Mono', monospace;
            }

            /* Responsive */
            @media (max-width: 640px) {
                .neural-hive-header {
                    flex-direction: column;
                    align-items: flex-start;
                }

                .agent-node {
                    flex: 1 1 calc(50% - 4px);
                    min-width: 120px;
                }
            }
        `;
        document.head.appendChild(styles);
    }

    // =============================================================================
    // INITIALIZATION
    // =============================================================================

    function init() {
        console.log('[NeuralHive] Initializing 23-agent monitoring dashboard...');

        // Inject styles
        injectStyles();

        // Create floating Neural Hive panel (independent of genesis-container)
        const hiveContainer = document.createElement('div');
        hiveContainer.id = 'neural-hive-container';
        document.body.appendChild(hiveContainer);

        // Create floating toggle button (FAB style)
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'neural-hive-toggle';
        toggleBtn.innerHTML = '<span class="toggle-icon">🧠</span><span class="toggle-text">HIVE</span>';
        toggleBtn.onclick = toggleNeuralHive;
        toggleBtn.title = 'Toggle Neural Hive - 23 Agent Dashboard';
        document.body.appendChild(toggleBtn);

        // Initial render
        renderNeuralHive();

        // Expose to window for external control
        window.NeuralHive = {
            connect: connectToGenesis,
            disconnect: disconnectFromGenesis,
            toggle: toggleNeuralHive,
            demo: runDemoMode,
            state: NeuralHiveState,
            agents: NEURAL_HIVE_AGENTS
        };

        console.log('[NeuralHive] Ready. Use window.NeuralHive.demo() to test.');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
