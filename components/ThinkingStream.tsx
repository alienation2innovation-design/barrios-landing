/**
 * ================================================================================
 * 🧠 NEXUS THINKING STREAM v2.0 LEGENDARY EDITION
 * ================================================================================
 * 
 * UPGRADE 2: Holographic Visualization
 * UPGRADE 3: Semantic Badging for Reflection Tokens
 * 
 * Features:
 * - WebSocket with auto-reconnect + history replay
 * - Holographic modules for each cognitive action
 * - Reflection Token badges ([RET][REL][SUP][USE])
 * - Spreading Activation visualization
 * - Graph-of-Thoughts branch rendering
 * - Dead-branch pruning indicators
 * - Supernode dampening visualization
 * - Cyberpunk HUD aesthetic
 * 
 * Design: Tesla minimalism meets Cyberpunk
 * - Primary: Crystalline Teal (#00CED1)
 * - Secondary: Cyan (#00C2FF)
 * - Accent: Gold (#FFD700)
 * - Error: Rose (#FF4757)
 * - Success: Emerald (#10B981)
 * 
 * Author: Barrios A2I | Version: 2.0.0 LEGENDARY | January 2026
 * ================================================================================
 */

'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// =============================================================================
// TYPES
// =============================================================================

interface ThinkingEvent {
  type: string;
  step: string;
  status: string;
  data: Record<string, any>;
  timestamp: number;
  duration_ms?: number;
  session_id?: string;
  token?: string;      // Reflection token: "RET", "REL", "SUP", "USE"
  score?: number;      // Token score 0-1
  node_id?: string;    // GoT node ID
  depth?: number;      // GoT depth
  content?: string;    // Thought content
}

// Genesis Lead Data interface
interface LeadData {
  businessName: string;
  industry: string;
  goals: string[];
  painPoints?: string[];
  targetAudience?: string;
  score: number;
}

// Genesis Pipeline Event interface
interface GenesisEvent {
  event: string;
  pipeline_id: string;
  stage?: string;
  agent?: string;
  status?: string;
  progress?: number;
  message?: string;
  result?: Record<string, any>;
  error?: string;
  timestamp: number;
}

interface ThinkingStreamProps {
  sessionId: string;
  wsUrl?: string;
  onComplete?: (result: any) => void;
  onError?: (error: Error) => void;
  maxEvents?: number;
  showMetrics?: boolean;
  className?: string;
  // Genesis Integration Props
  qualificationScore?: number;
  leadData?: LeadData;
  genesisApiUrl?: string;
  onGenesisComplete?: (result: any) => void;
  showGenesisButton?: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const COGNITIVE_MODES = {
  nrc: { name: 'Regular Cognition', color: '#00CED1', icon: '⚡', label: 'FAST' },
  nqr: { name: 'Query Reasoning', color: '#00C2FF', icon: '🔍', label: 'STANDARD' },
  ndr: { name: 'Deep Reasoning', color: '#FFD700', icon: '🧠', label: 'DEEP' },
  nsc: { name: 'Self-Critique', color: '#FF6B6B', icon: '✓', label: 'CRITIQUE' },
  nad: { name: 'Adversarial Defense', color: '#FF4757', icon: '🛡️', label: 'DEFENSE' },
  ncg: { name: 'Creative Generation', color: '#A855F7', icon: '✨', label: 'CREATIVE' },
  npm: { name: 'Precision Mode', color: '#10B981', icon: '🎯', label: 'PRECISE' },
};

const REFLECTION_TOKENS = {
  RET: { 
    name: 'Retrieve', 
    description: 'Should I retrieve more?',
    goodColor: '#10B981',
    badColor: '#6B7280'
  },
  REL: { 
    name: 'Relevance', 
    description: 'Is this relevant?',
    goodColor: '#00C2FF',
    badColor: '#FF6B6B'
  },
  SUP: { 
    name: 'Support', 
    description: 'Is this grounded?',
    goodColor: '#10B981',
    badColor: '#FF4757'
  },
  USE: { 
    name: 'Usefulness', 
    description: 'Is this helpful?',
    goodColor: '#FFD700',
    badColor: '#FF6B6B'
  },
};

const PHASE_CONFIG: Record<string, { phase: string; progress: number; color: string }> = {
  session_started: { phase: 'Initialize', progress: 5, color: '#00CED1' },
  session_reconnected: { phase: 'Reconnect', progress: 5, color: '#FFD700' },
  analyzing_complexity: { phase: 'Analysis', progress: 10, color: '#00CED1' },
  mode_selected: { phase: 'Routing', progress: 15, color: '#00C2FF' },
  thresholds_calibrated: { phase: 'Calibration', progress: 20, color: '#A855F7' },
  activating_memory: { phase: 'Memory', progress: 25, color: '#00CED1' },
  spreading_activation: { phase: 'Memory', progress: 30, color: '#00CED1' },
  node_activated: { phase: 'Memory', progress: 35, color: '#00CED1' },
  supernode_dampened: { phase: 'Memory', progress: 35, color: '#FFD700' },
  retrieving_documents: { phase: 'Retrieval', progress: 40, color: '#00C2FF' },
  documents_scored: { phase: 'Retrieval', progress: 50, color: '#00C2FF' },
  documents_filtered: { phase: 'Retrieval', progress: 55, color: '#00C2FF' },
  reflection_ret: { phase: 'Reflection', progress: 58, color: '#10B981' },
  reflection_rel: { phase: 'Reflection', progress: 60, color: '#00C2FF' },
  thought_generated: { phase: 'Reasoning', progress: 65, color: '#FFD700' },
  thought_verified: { phase: 'Reasoning', progress: 70, color: '#10B981' },
  thought_pruned: { phase: 'Reasoning', progress: 68, color: '#FF6B6B' },
  branch_expanded: { phase: 'Reasoning', progress: 72, color: '#FFD700' },
  backtracking: { phase: 'Reasoning', progress: 67, color: '#FF6B6B' },
  generation_chunk: { phase: 'Generation', progress: 80, color: '#A855F7' },
  reflection_sup: { phase: 'Verification', progress: 85, color: '#10B981' },
  reflection_use: { phase: 'Assessment', progress: 88, color: '#FFD700' },
  critiquing_answer: { phase: 'Critique', progress: 90, color: '#FF6B6B' },
  answer_accepted: { phase: 'Accepted', progress: 95, color: '#10B981' },
  complete: { phase: 'Complete', progress: 100, color: '#10B981' },
  error: { phase: 'Error', progress: 0, color: '#FF4757' },
};

// =============================================================================
// GENESIS PIPELINE CONFIGURATION
// =============================================================================

const GENESIS_AGENTS = {
  trend_scout: { name: 'Trend Scout', icon: '🔍', color: '#00C2FF' },
  market_analyst: { name: 'Market Analyst', icon: '📊', color: '#A855F7' },
  competitor_tracker: { name: 'Competitor Tracker', icon: '🎯', color: '#FF6B6B' },
  strategy_synthesizer: { name: 'Strategy Synthesizer', icon: '🧠', color: '#FFD700' },
  ragnarok: { name: 'RAGNAROK Video Gen', icon: '🎬', color: '#10B981' },
};

const GENESIS_STAGES: Record<string, { phase: string; progress: number; color: string }> = {
  pipeline_started: { phase: 'Initializing', progress: 5, color: '#00CED1' },
  trend_analysis: { phase: 'Trend Analysis', progress: 15, color: '#00C2FF' },
  market_research: { phase: 'Market Research', progress: 30, color: '#A855F7' },
  competitor_scan: { phase: 'Competitor Scan', progress: 45, color: '#FF6B6B' },
  strategy_synthesis: { phase: 'Strategy Synthesis', progress: 65, color: '#FFD700' },
  video_generation: { phase: 'Video Generation', progress: 85, color: '#10B981' },
  pipeline_complete: { phase: 'Complete', progress: 100, color: '#10B981' },
  pipeline_error: { phase: 'Error', progress: 0, color: '#FF4757' },
};

// =============================================================================
// UPGRADE 3: SEMANTIC BADGING COMPONENTS
// =============================================================================

interface ReflectionBadgeProps {
  token: string;
  score: number;
  isAnimated?: boolean;
}

const ReflectionBadge: React.FC<ReflectionBadgeProps> = ({ token, score, isAnimated = true }) => {
  const config = REFLECTION_TOKENS[token as keyof typeof REFLECTION_TOKENS];
  if (!config) return null;
  
  const isGood = token === 'RET' 
    ? score < 0.5  // For RET, low uncertainty is good
    : score >= 0.6;
  
  const color = isGood ? config.goodColor : config.badColor;
  
  return (
    <motion.div
      initial={isAnimated ? { scale: 0.8, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono"
      style={{
        backgroundColor: `${color}15`,
        border: `1px solid ${color}40`,
        color: color,
      }}
    >
      <span className="font-bold">[{token}]</span>
      <span className="opacity-70">{config.name}</span>
      <span 
        className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
        style={{ backgroundColor: `${color}25` }}
      >
        {(score * 100).toFixed(0)}%
      </span>
      {isGood ? (
        <span className="text-[10px]">✓</span>
      ) : (
        <span className="text-[10px]">✗</span>
      )}
    </motion.div>
  );
};

// =============================================================================
// UPGRADE 2: HOLOGRAPHIC UI COMPONENTS
// =============================================================================

interface MemoryNodeProps {
  count: number;
  hops: number;
  supernodesDampened?: number;
}

const MemoryNode: React.FC<MemoryNodeProps> = ({ count, hops, supernodesDampened = 0 }) => (
  <motion.div
    initial={{ scale: 0.9, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="relative flex items-center gap-4 p-4 rounded-xl my-2 overflow-hidden"
    style={{
      background: 'linear-gradient(135deg, rgba(0, 206, 209, 0.1), rgba(0, 194, 255, 0.05))',
      border: '1px solid rgba(0, 206, 209, 0.3)',
    }}
  >
    {/* Animated background pulse */}
    <div className="absolute inset-0 opacity-30">
      <div 
        className="absolute inset-0 animate-pulse"
        style={{
          background: 'radial-gradient(circle at 30% 50%, rgba(0, 206, 209, 0.3), transparent 50%)',
        }}
      />
    </div>
    
    {/* Icon with ring animation */}
    <div className="relative w-10 h-10 flex items-center justify-center z-10">
      <span 
        className="absolute inset-0 rounded-full animate-ping opacity-20"
        style={{ backgroundColor: '#00CED1' }}
      />
      <span 
        className="absolute inset-1 rounded-full animate-pulse opacity-40"
        style={{ backgroundColor: '#00CED1' }}
      />
      <span 
        className="w-3 h-3 rounded-full z-10"
        style={{ backgroundColor: '#00CED1', boxShadow: '0 0 10px #00CED1' }}
      />
    </div>
    
    {/* Content */}
    <div className="z-10 flex-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold tracking-wider" style={{ color: '#00CED1' }}>
          SPREADING ACTIVATION
        </span>
        {supernodesDampened > 0 && (
          <span 
            className="text-[10px] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: 'rgba(255, 215, 0, 0.2)', color: '#FFD700' }}
          >
            {supernodesDampened} dampened
          </span>
        )}
      </div>
      <div className="text-[11px] text-white/60 mt-1">
        Activated <span className="text-white font-medium">{count}</span> memory nodes across <span className="text-white font-medium">{hops}</span> hops
      </div>
    </div>
    
    {/* Stats */}
    <div className="z-10 text-right">
      <div className="text-lg font-bold" style={{ color: '#00CED1' }}>{count}</div>
      <div className="text-[10px] text-white/40 uppercase">nodes</div>
    </div>
  </motion.div>
);

interface ThoughtBranchProps {
  content: string;
  depth: number;
  nodeId: string;
  prmScore?: number;
  isPruned?: boolean;
  tokensSaved?: number;
}

const ThoughtBranch: React.FC<ThoughtBranchProps> = ({ 
  content, 
  depth, 
  nodeId,
  prmScore,
  isPruned = false,
  tokensSaved = 0
}) => {
  const depthColors = ['#FFD700', '#00C2FF', '#A855F7', '#10B981'];
  const color = depthColors[Math.min(depth, depthColors.length - 1)];
  
  return (
    <motion.div
      initial={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: isPruned ? 0.5 : 1 }}
      className="flex gap-2 my-1.5"
      style={{ marginLeft: `${depth * 16}px` }}
    >
      {/* Depth indicator line */}
      <div 
        className="w-0.5 rounded-full"
        style={{ 
          backgroundColor: isPruned ? '#FF4757' : color,
          minHeight: '28px',
          opacity: isPruned ? 0.5 : 0.6
        }}
      />
      
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span style={{ color }} className="text-sm">
            {isPruned ? '✗' : '↳'}
          </span>
          <span className="text-[10px] font-mono text-white/40">
            {nodeId.slice(0, 8)}
          </span>
          {prmScore !== undefined && (
            <span 
              className="text-[10px] px-1.5 py-0.5 rounded font-mono"
              style={{
                backgroundColor: prmScore >= 0.6 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 71, 87, 0.2)',
                color: prmScore >= 0.6 ? '#10B981' : '#FF4757'
              }}
            >
              PRM: {(prmScore * 100).toFixed(0)}%
            </span>
          )}
          {isPruned && (
            <span 
              className="text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{ backgroundColor: 'rgba(255, 71, 87, 0.2)', color: '#FF4757' }}
            >
              PRUNED 💰 {tokensSaved} tokens saved
            </span>
          )}
        </div>
        <div 
          className="text-xs leading-relaxed"
          style={{ 
            color: isPruned ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.8)',
            textDecoration: isPruned ? 'line-through' : 'none'
          }}
        >
          {content}
        </div>
      </div>
    </motion.div>
  );
};

interface SupernodeDampenedProps {
  degree: number;
  dampeningFactor: number;
}

const SupernodeDampened: React.FC<SupernodeDampenedProps> = ({ degree, dampeningFactor }) => (
  <motion.div
    initial={{ scale: 0.95, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="flex items-center gap-3 p-3 rounded-lg my-1"
    style={{
      background: 'rgba(255, 215, 0, 0.05)',
      border: '1px solid rgba(255, 215, 0, 0.2)',
    }}
  >
    <span className="text-lg">🎯</span>
    <div className="flex-1">
      <div className="text-xs font-bold" style={{ color: '#FFD700' }}>
        SUPERNODE DAMPENED
      </div>
      <div className="text-[10px] text-white/50">
        Node with {degree} connections reduced to {(dampeningFactor * 100).toFixed(0)}% signal
      </div>
    </div>
    <div
      className="text-sm font-mono font-bold"
      style={{ color: '#FFD700' }}
    >
      ×{dampeningFactor.toFixed(2)}
    </div>
  </motion.div>
);

// =============================================================================
// GENESIS PIPELINE VISUALIZATION COMPONENTS
// =============================================================================

interface GenesisAgentProgressProps {
  agent: string;
  status: string;
  message?: string;
  progress?: number;
}

const GenesisAgentProgress: React.FC<GenesisAgentProgressProps> = ({
  agent,
  status,
  message,
  progress
}) => {
  const agentConfig = GENESIS_AGENTS[agent as keyof typeof GENESIS_AGENTS] || {
    name: agent,
    icon: '🤖',
    color: '#00CED1'
  };

  const isActive = status === 'running' || status === 'processing';
  const isComplete = status === 'complete' || status === 'success';
  const isError = status === 'error' || status === 'failed';

  return (
    <motion.div
      initial={{ x: -10, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="flex items-center gap-3 p-3 rounded-xl my-2"
      style={{
        background: isError
          ? 'rgba(255, 71, 87, 0.1)'
          : isComplete
            ? 'rgba(16, 185, 129, 0.1)'
            : `${agentConfig.color}15`,
        border: `1px solid ${isError ? 'rgba(255, 71, 87, 0.3)' : isComplete ? 'rgba(16, 185, 129, 0.3)' : `${agentConfig.color}40`}`,
      }}
    >
      {/* Agent Icon with pulse animation when active */}
      <div className="relative w-10 h-10 flex items-center justify-center">
        {isActive && (
          <span
            className="absolute inset-0 rounded-full animate-ping opacity-30"
            style={{ backgroundColor: agentConfig.color }}
          />
        )}
        <span className="text-2xl z-10">{agentConfig.icon}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-bold tracking-wider"
            style={{ color: isError ? '#FF4757' : isComplete ? '#10B981' : agentConfig.color }}
          >
            {agentConfig.name.toUpperCase()}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{
              backgroundColor: isError
                ? 'rgba(255, 71, 87, 0.2)'
                : isComplete
                  ? 'rgba(16, 185, 129, 0.2)'
                  : isActive
                    ? 'rgba(255, 215, 0, 0.2)'
                    : 'rgba(255, 255, 255, 0.1)',
              color: isError ? '#FF4757' : isComplete ? '#10B981' : isActive ? '#FFD700' : '#fff'
            }}
          >
            {status.toUpperCase()}
          </span>
        </div>
        {message && (
          <div className="text-[11px] text-white/60 mt-1 truncate">
            {message}
          </div>
        )}
        {progress !== undefined && isActive && (
          <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: agentConfig.color }}
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}
      </div>

      {/* Status icon */}
      <div className="text-lg">
        {isComplete ? '✅' : isError ? '❌' : isActive ? '⏳' : '⏸️'}
      </div>
    </motion.div>
  );
};

interface GenesisStrategyButtonProps {
  onClick: () => void;
  isLoading: boolean;
  disabled: boolean;
  qualificationScore: number;
}

const GenesisStrategyButton: React.FC<GenesisStrategyButtonProps> = ({
  onClick,
  isLoading,
  disabled,
  qualificationScore
}) => (
  <motion.button
    initial={{ scale: 0.95, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    whileHover={!disabled ? { scale: 1.02 } : undefined}
    whileTap={!disabled ? { scale: 0.98 } : undefined}
    onClick={onClick}
    disabled={disabled || isLoading}
    className="w-full py-4 px-6 rounded-xl font-bold text-sm relative overflow-hidden transition-all"
    style={{
      background: disabled
        ? 'rgba(107, 114, 128, 0.2)'
        : 'linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(0, 206, 209, 0.2))',
      border: disabled
        ? '1px solid rgba(107, 114, 128, 0.3)'
        : '1px solid rgba(16, 185, 129, 0.4)',
      color: disabled ? '#6B7280' : '#10B981',
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}
  >
    {/* Animated background gradient */}
    {!disabled && (
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.3), transparent)',
          animation: 'shimmer 2s infinite',
        }}
      />
    )}

    <div className="flex items-center justify-center gap-3 relative z-10">
      {isLoading ? (
        <>
          <span className="animate-spin">⚡</span>
          <span>Generating Strategy...</span>
        </>
      ) : (
        <>
          <span>🚀</span>
          <span>Generate AI Strategy</span>
          <span
            className="text-[10px] px-2 py-0.5 rounded-full ml-2"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
          >
            Score: {(qualificationScore * 100).toFixed(0)}%
          </span>
        </>
      )}
    </div>
  </motion.button>
);

interface ModeSelectedProps {
  mode: string;
  complexity?: number;
}

const ModeSelected: React.FC<ModeSelectedProps> = ({ mode, complexity }) => {
  const modeKey = mode.replace('neural_', '').replace('_cognition', '').replace('_reasoning', '').replace('_generation', '').replace('_mode', '').replace('_defense', '');
  const config = COGNITIVE_MODES[modeKey as keyof typeof COGNITIVE_MODES] || COGNITIVE_MODES.nqr;
  
  return (
    <motion.div
      initial={{ y: -10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="flex items-center justify-center gap-3 py-3 my-2"
    >
      <div 
        className="flex items-center gap-2 px-4 py-2 rounded-full"
        style={{
          background: `linear-gradient(135deg, ${config.color}20, ${config.color}05)`,
          border: `1px solid ${config.color}40`,
        }}
      >
        <span className="text-lg">{config.icon}</span>
        <span className="text-sm font-bold" style={{ color: config.color }}>
          {config.label}
        </span>
        <span className="text-xs text-white/50">
          {config.name}
        </span>
        {complexity !== undefined && (
          <span 
            className="text-[10px] px-2 py-0.5 rounded-full ml-1"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
          >
            Complexity: {complexity.toFixed(1)}
          </span>
        )}
      </div>
    </motion.div>
  );
};

interface ThresholdsDisplayProps {
  thresholds: Record<string, number>;
}

const ThresholdsDisplay: React.FC<ThresholdsDisplayProps> = ({ thresholds }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="flex flex-wrap gap-2 justify-center my-2"
  >
    {Object.entries(thresholds).slice(0, 4).map(([key, value]) => (
      <span 
        key={key}
        className="text-[10px] px-2 py-1 rounded font-mono"
        style={{ 
          backgroundColor: 'rgba(168, 85, 247, 0.1)', 
          border: '1px solid rgba(168, 85, 247, 0.3)',
          color: '#A855F7'
        }}
      >
        {key}: {typeof value === 'number' ? value.toFixed(2) : value}
      </span>
    ))}
  </motion.div>
);

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ThinkingStream: React.FC<ThinkingStreamProps> = ({
  sessionId,
  wsUrl = 'ws://localhost:8000/ws',
  onComplete,
  onError,
  maxEvents = 100,
  showMetrics = true,
  className = '',
  // Genesis props
  qualificationScore = 0,
  leadData,
  genesisApiUrl = 'https://api.barriosa2i.com',
  onGenesisComplete,
  showGenesisButton = true,
}) => {
  const [events, setEvents] = useState<ThinkingEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('connecting');
  const [currentMode, setCurrentMode] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    latency: 0,
    retrievals: 0,
    thoughts: 0,
    tokensSaved: 0,
    branchesPruned: 0,
    supernodesDampened: 0,
  });
  const [isReplaying, setIsReplaying] = useState(false);

  // Genesis Pipeline State
  const [genesisPipelineId, setGenesisPipelineId] = useState<string | null>(null);
  const [genesisStatus, setGenesisStatus] = useState<'idle' | 'loading' | 'running' | 'complete' | 'error'>('idle');
  const [genesisEvents, setGenesisEvents] = useState<GenesisEvent[]>([]);
  const [genesisProgress, setGenesisProgress] = useState(0);
  const [genesisPhase, setGenesisPhase] = useState<string>('Ready');

  const eventListRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const genesisEventSourceRef = useRef<EventSource | null>(null);
  
  // Auto-scroll
  useEffect(() => {
    if (eventListRef.current) {
      eventListRef.current.scrollTop = eventListRef.current.scrollHeight;
    }
  }, [events]);
  
  // WebSocket connection
  useEffect(() => {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    const connect = () => {
      const ws = new WebSocket(`${wsUrl}/cognitive/${sessionId}`);
      wsRef.current = ws;
      
      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectAttempts = 0;
      };
      
      ws.onmessage = (msg) => {
        try {
          const event: ThinkingEvent = JSON.parse(msg.data);
          
          // Handle history replay
          if (event.type === 'session_reconnected') {
            setIsReplaying(true);
            setConnectionStatus('reconnecting');
          } else if (event.type === 'history_replay' && event.status === 'complete') {
            setIsReplaying(false);
            setConnectionStatus('connected');
          }
          
          // Skip replay marker events from display
          if (event.data?.is_replay && !['session_reconnected', 'history_replay'].includes(event.type)) {
            // Add replay events but mark them
            event.data.is_replay = true;
          }
          
          setEvents(prev => [...prev, event].slice(-maxEvents));
          
          // Update metrics based on event
          if (event.type === 'mode_selected' && event.data?.mode) {
            setCurrentMode(event.data.mode);
          }
          
          if (event.type === 'thought_pruned') {
            setMetrics(prev => ({
              ...prev,
              tokensSaved: prev.tokensSaved + (event.data?.tokens_saved || 0),
              branchesPruned: prev.branchesPruned + 1,
            }));
          }
          
          if (event.type === 'supernode_dampened') {
            setMetrics(prev => ({
              ...prev,
              supernodesDampened: prev.supernodesDampened + 1,
            }));
          }
          
          if (event.type === 'thought_generated' || event.type === 'thought_verified') {
            setMetrics(prev => ({ ...prev, thoughts: prev.thoughts + 1 }));
          }
          
          if (event.type === 'complete') {
            setMetrics(prev => ({
              ...prev,
              latency: event.data?.elapsed_ms || prev.latency,
            }));
            onComplete?.(event.data);
          }
          
        } catch (e) {
          console.error('Event parse error:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(new Error('WebSocket connection error'));
      };
      
      ws.onclose = () => {
        setConnectionStatus('disconnected');
        wsRef.current = null;
        
        // Auto-reconnect with exponential backoff
        if (reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttempts++;
            setConnectionStatus('reconnecting');
            connect();
          }, delay);
        }
      };
    };
    
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [sessionId, wsUrl, maxEvents, onComplete, onError]);

  // =============================================================================
  // GENESIS PIPELINE INTEGRATION
  // =============================================================================

  // Trigger Genesis Pipeline
  const triggerGenesis = useCallback(async () => {
    if (!leadData || genesisStatus === 'loading' || genesisStatus === 'running') {
      return;
    }

    setGenesisStatus('loading');
    setGenesisEvents([]);
    setGenesisProgress(0);
    setGenesisPhase('Initializing');

    try {
      const response = await fetch(`${genesisApiUrl}/api/genesis/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          business_name: leadData.businessName,
          industry: leadData.industry,
          goals: leadData.goals,
          pain_points: leadData.painPoints,
          target_audience: leadData.targetAudience,
          qualification_score: leadData.score,
          generate_video: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Genesis trigger failed: ${response.status}`);
      }

      const data = await response.json();
      const pipelineId = data.pipeline_id;
      setGenesisPipelineId(pipelineId);
      setGenesisStatus('running');

      // Connect to SSE stream
      connectToGenesisStream(pipelineId);

    } catch (error) {
      console.error('Genesis trigger error:', error);
      setGenesisStatus('error');
      onError?.(error instanceof Error ? error : new Error('Genesis trigger failed'));
    }
  }, [leadData, sessionId, genesisApiUrl, genesisStatus, onError]);

  // Connect to Genesis SSE Stream
  const connectToGenesisStream = useCallback((pipelineId: string) => {
    // Close existing connection if any
    if (genesisEventSourceRef.current) {
      genesisEventSourceRef.current.close();
    }

    const eventSource = new EventSource(
      `${genesisApiUrl}/api/genesis/stream/${pipelineId}`
    );
    genesisEventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data: GenesisEvent = JSON.parse(event.data);

        setGenesisEvents((prev) => [...prev, data]);

        // Update progress and phase based on event
        if (data.stage && GENESIS_STAGES[data.stage]) {
          setGenesisProgress(GENESIS_STAGES[data.stage].progress);
          setGenesisPhase(GENESIS_STAGES[data.stage].phase);
        }

        if (data.progress !== undefined) {
          setGenesisProgress(data.progress);
        }

        // Handle completion
        if (data.event === 'pipeline_complete' || data.event === 'complete') {
          setGenesisStatus('complete');
          setGenesisProgress(100);
          setGenesisPhase('Complete');
          eventSource.close();
          onGenesisComplete?.(data.result);
        }

        // Handle errors
        if (data.event === 'pipeline_error' || data.event === 'error') {
          setGenesisStatus('error');
          setGenesisPhase('Error');
          eventSource.close();
          onError?.(new Error(data.error || 'Pipeline error'));
        }

      } catch (e) {
        console.error('Genesis event parse error:', e);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Genesis SSE error:', error);
      setGenesisStatus('error');
      eventSource.close();
    };

  }, [genesisApiUrl, onGenesisComplete, onError]);

  // Cleanup Genesis EventSource on unmount
  useEffect(() => {
    return () => {
      if (genesisEventSourceRef.current) {
        genesisEventSourceRef.current.close();
      }
    };
  }, []);

  // Check if Genesis button should be shown
  const shouldShowGenesisButton = useMemo(() => {
    return showGenesisButton && qualificationScore >= 0.8 && leadData && genesisStatus === 'idle';
  }, [showGenesisButton, qualificationScore, leadData, genesisStatus]);

  // Render Genesis event
  const renderGenesisEvent = (event: GenesisEvent, index: number) => {
    if (event.agent) {
      return (
        <GenesisAgentProgress
          key={`genesis-${index}`}
          agent={event.agent}
          status={event.status || 'running'}
          message={event.message}
          progress={event.progress}
        />
      );
    }

    // Generic event display
    return (
      <motion.div
        key={`genesis-${index}`}
        initial={{ opacity: 0, x: -5 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-2 py-1.5 text-xs"
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: '#10B981' }}
        />
        <span className="text-white/70">
          {event.message || event.event.replace(/_/g, ' ')}
        </span>
      </motion.div>
    );
  };

  // Calculate progress
  const currentProgress = useMemo(() => {
    const latestEvent = events[events.length - 1];
    if (!latestEvent) return 0;
    return PHASE_CONFIG[latestEvent.type]?.progress || 0;
  }, [events]);
  
  const currentPhase = useMemo(() => {
    const latestEvent = events[events.length - 1];
    if (!latestEvent) return 'Ready';
    return PHASE_CONFIG[latestEvent.type]?.phase || 'Processing';
  }, [events]);
  
  const phaseColor = useMemo(() => {
    const latestEvent = events[events.length - 1];
    if (!latestEvent) return '#00CED1';
    return PHASE_CONFIG[latestEvent.type]?.color || '#00CED1';
  }, [events]);
  
  // Render event by type
  const renderEvent = (event: ThinkingEvent, index: number) => {
    const isLatest = index === events.length - 1;
    const isReplay = event.data?.is_replay;
    
    switch (event.type) {
      case 'mode_selected':
        return (
          <ModeSelected 
            key={index}
            mode={event.data?.mode || ''} 
            complexity={event.data?.complexity_score}
          />
        );
      
      case 'thresholds_calibrated':
        return (
          <ThresholdsDisplay 
            key={index}
            thresholds={event.data || {}}
          />
        );
      
      case 'spreading_activation':
      case 'subgraph_extracted':
        return (
          <MemoryNode
            key={index}
            count={event.data?.entities || event.data?.nodes_activated || 0}
            hops={event.data?.hops || event.data?.total_hops || 2}
            supernodesDampened={event.data?.supernodes_dampened}
          />
        );
      
      case 'supernode_dampened':
        return (
          <SupernodeDampened
            key={index}
            degree={event.data?.node_degree || 0}
            dampeningFactor={event.data?.dampening_factor || 1}
          />
        );
      
      case 'thought_generated':
      case 'thought_verified':
        return (
          <ThoughtBranch
            key={index}
            content={event.content || event.data?.thought || `Thought at depth ${event.depth || 0}`}
            depth={event.depth || event.data?.depth || 0}
            nodeId={event.node_id || event.data?.node_id || `node-${index}`}
            prmScore={event.data?.prm_score}
          />
        );
      
      case 'thought_pruned':
        return (
          <ThoughtBranch
            key={index}
            content={event.content || event.data?.thought || 'Low confidence branch'}
            depth={event.depth || event.data?.depth || 1}
            nodeId={event.node_id || event.data?.node_id || `pruned-${index}`}
            prmScore={event.data?.prm_score}
            isPruned={true}
            tokensSaved={event.data?.tokens_saved || 0}
          />
        );
      
      case 'reflection_ret':
      case 'reflection_rel':
      case 'reflection_sup':
      case 'reflection_use':
        const token = event.token || event.type.replace('reflection_', '').toUpperCase();
        return (
          <div key={index} className="ml-4 my-2">
            <ReflectionBadge
              token={token}
              score={event.score || event.data?.score || 0.5}
              isAnimated={isLatest && !isReplay}
            />
            {event.data?.threshold !== undefined && (
              <span className="text-[10px] text-white/30 ml-2">
                threshold: {event.data.threshold}
              </span>
            )}
          </div>
        );
      
      case 'complete':
        return (
          <motion.div
            key={index}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-4 rounded-xl my-3"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(0, 206, 209, 0.05))',
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">✅</span>
              <span className="text-sm font-bold" style={{ color: '#10B981' }}>
                PROCESSING COMPLETE
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-lg font-bold text-white">
                  {event.data?.elapsed_ms?.toFixed(0) || '--'}ms
                </div>
                <div className="text-[10px] text-white/40">Latency</div>
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: '#FFD700' }}>
                  {event.data?.tokens_saved || 0}
                </div>
                <div className="text-[10px] text-white/40">Tokens Saved</div>
              </div>
              <div>
                <div className="text-lg font-bold" style={{ color: '#00CED1' }}>
                  {((event.data?.confidence || 0.85) * 100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-white/40">Confidence</div>
              </div>
            </div>
          </motion.div>
        );
      
      case 'error':
        return (
          <motion.div
            key={index}
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-3 rounded-lg my-2"
            style={{
              background: 'rgba(255, 71, 87, 0.1)',
              border: '1px solid rgba(255, 71, 87, 0.3)',
            }}
          >
            <div className="flex items-center gap-2">
              <span>❌</span>
              <span className="text-sm font-bold" style={{ color: '#FF4757' }}>
                ERROR
              </span>
            </div>
            <div className="text-xs text-white/60 mt-1">
              {event.data?.error || 'Unknown error occurred'}
            </div>
          </motion.div>
        );
      
      // Default simple event rendering
      default:
        if (['heartbeat', 'session_started', 'session_reconnected', 'history_replay'].includes(event.type)) {
          return null; // Don't render system events
        }
        
        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: isReplay ? 0.6 : 1, x: 0 }}
            className="flex items-center gap-2 py-1.5 text-xs"
          >
            <span 
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: phaseColor }}
            />
            <span className="text-white/70">
              {event.step.replace(/_/g, ' ')}
            </span>
            <span className="text-white/40">•</span>
            <span className="text-white/50">{event.status}</span>
            {isReplay && (
              <span className="text-[10px] text-white/30 ml-auto">replay</span>
            )}
          </motion.div>
        );
    }
  };
  
  return (
    <div 
      className={`w-full max-w-2xl mx-auto rounded-2xl overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(180deg, rgba(10, 10, 30, 0.98), rgba(5, 5, 20, 0.98))',
        border: '1px solid rgba(0, 206, 209, 0.2)',
        boxShadow: '0 0 40px rgba(0, 206, 209, 0.1)',
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-5 py-3"
        style={{
          background: 'rgba(0, 206, 209, 0.05)',
          borderBottom: '1px solid rgba(0, 206, 209, 0.15)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🧠</span>
          <div>
            <div className="text-sm font-bold text-white">Neural Thinking Stream</div>
            <div className="text-[10px] text-white/40 font-mono">{sessionId.slice(0, 12)}</div>
          </div>
        </div>
        
        {/* Connection Status */}
        <div 
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-medium"
          style={{
            background: connectionStatus === 'connected' ? 'rgba(16, 185, 129, 0.15)' :
                       connectionStatus === 'reconnecting' ? 'rgba(255, 215, 0, 0.15)' :
                       'rgba(255, 71, 87, 0.15)',
            color: connectionStatus === 'connected' ? '#10B981' :
                   connectionStatus === 'reconnecting' ? '#FFD700' :
                   '#FF4757',
            border: `1px solid ${connectionStatus === 'connected' ? 'rgba(16, 185, 129, 0.3)' :
                                connectionStatus === 'reconnecting' ? 'rgba(255, 215, 0, 0.3)' :
                                'rgba(255, 71, 87, 0.3)'}`,
          }}
        >
          <span 
            className="w-2 h-2 rounded-full"
            style={{ 
              backgroundColor: 'currentColor',
              animation: connectionStatus === 'connecting' || connectionStatus === 'reconnecting' 
                ? 'pulse 1s infinite' 
                : 'none'
            }}
          />
          {connectionStatus === 'reconnecting' && isReplaying ? 'Replaying...' : connectionStatus}
        </div>
      </div>
      
      {/* Progress Bar */}
      <div className="px-5 py-3">
        <div 
          className="h-1 rounded-full overflow-hidden"
          style={{ background: 'rgba(255, 255, 255, 0.05)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${phaseColor}, ${phaseColor}99)`,
              boxShadow: `0 0 10px ${phaseColor}66`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${currentProgress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <div className="flex justify-between mt-2 text-[11px]">
          <span style={{ color: phaseColor }}>{currentPhase}</span>
          <span className="text-white/40">{currentProgress}%</span>
        </div>
      </div>
      
      {/* Genesis Strategy Button - Shows when qualification score >= 0.8 */}
      {shouldShowGenesisButton && (
        <div className="px-5 py-3">
          <GenesisStrategyButton
            onClick={triggerGenesis}
            isLoading={genesisStatus === 'loading'}
            disabled={!leadData || qualificationScore < 0.8}
            qualificationScore={qualificationScore}
          />
        </div>
      )}

      {/* Genesis Pipeline Progress - Shows when running */}
      {(genesisStatus === 'running' || genesisStatus === 'loading') && (
        <div className="px-5 py-3">
          <div
            className="p-4 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(0, 206, 209, 0.05))',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg animate-pulse">⚡</span>
                <span className="text-sm font-bold" style={{ color: '#10B981' }}>
                  GENESIS PIPELINE
                </span>
              </div>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-mono"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)', color: '#10B981' }}
              >
                {genesisPhase}
              </span>
            </div>

            {/* Genesis Progress Bar */}
            <div
              className="h-2 rounded-full overflow-hidden mb-3"
              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: 'linear-gradient(90deg, #10B981, #00CED1)',
                  boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)',
                }}
                initial={{ width: 0 }}
                animate={{ width: `${genesisProgress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="flex justify-between text-[11px]">
              <span className="text-white/50">
                {genesisPipelineId ? `Pipeline: ${genesisPipelineId.slice(0, 8)}...` : 'Initializing...'}
              </span>
              <span style={{ color: '#10B981' }}>{genesisProgress}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Genesis Complete Banner */}
      {genesisStatus === 'complete' && (
        <div className="px-5 py-3">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-4 rounded-xl"
            style={{
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(0, 206, 209, 0.1))',
              border: '1px solid rgba(16, 185, 129, 0.4)',
            }}
          >
            <div className="flex items-center justify-center gap-3">
              <span className="text-2xl">🎉</span>
              <div className="text-center">
                <div className="text-sm font-bold" style={{ color: '#10B981' }}>
                  STRATEGY GENERATED!
                </div>
                <div className="text-[11px] text-white/60 mt-1">
                  Your AI-powered strategy is ready
                </div>
              </div>
              <span className="text-2xl">🚀</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Event Stream */}
      <div
        ref={eventListRef}
        className="h-96 overflow-y-auto px-5 pb-4"
        style={{ scrollBehavior: 'smooth' }}
      >
        <AnimatePresence mode="popLayout">
          {/* Genesis Events Section */}
          {genesisEvents.length > 0 && (
            <div className="mb-4">
              <div
                className="text-[10px] uppercase tracking-wider py-2 px-3 rounded-lg mb-2 flex items-center gap-2"
                style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10B981' }}
              >
                <span>⚡</span>
                <span>Genesis Pipeline Events</span>
              </div>
              {genesisEvents.map((event, index) => renderGenesisEvent(event, index))}
            </div>
          )}

          {/* Original Events Section */}
          {events.length === 0 && genesisEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-white/30">
              <span className="text-4xl mb-3">🧠</span>
              <span className="text-sm">Waiting for cognitive events...</span>
            </div>
          ) : (
            <>
              {events.length > 0 && genesisEvents.length > 0 && (
                <div
                  className="text-[10px] uppercase tracking-wider py-2 px-3 rounded-lg mb-2 flex items-center gap-2"
                  style={{ backgroundColor: 'rgba(0, 206, 209, 0.1)', color: '#00CED1' }}
                >
                  <span>🧠</span>
                  <span>Neural Thinking Events</span>
                </div>
              )}
              {events.map((event, index) => renderEvent(event, index))}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Metrics Footer */}
      {showMetrics && (
        <div 
          className="grid grid-cols-4 gap-3 px-5 py-3"
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: '#00CED1' }}>
              {metrics.latency > 0 ? `${metrics.latency.toFixed(0)}` : '--'}
              <span className="text-[10px] text-white/40">ms</span>
            </div>
            <div className="text-[10px] text-white/40">Latency</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: '#FFD700' }}>
              {metrics.thoughts}
            </div>
            <div className="text-[10px] text-white/40">Thoughts</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: '#FF6B6B' }}>
              {metrics.branchesPruned}
            </div>
            <div className="text-[10px] text-white/40">Pruned</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold" style={{ color: '#10B981' }}>
              {metrics.tokensSaved}
            </div>
            <div className="text-[10px] text-white/40">Saved</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThinkingStream;
