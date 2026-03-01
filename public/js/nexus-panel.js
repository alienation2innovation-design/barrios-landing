/**
 * Nexus Panel - Glassmorphism Chat Drawer
 * Right-side sliding panel with focus trap and mobile support
 * P0-E: Session persistence - restores messages on load
 */
(function() {
  'use strict';

  // API Base URL - Updated to use GENESIS backend
  const NEXUS_API_BASE = window.NEXUS_API_BASE || 'https://api.barriosa2i.com/api/nexus';
  let hasRestoredMessages = false;

  const PANEL_ID = 'nexus-panel';
  const BACKDROP_ID = 'nexus-backdrop';
  let panelElement = null;
  let backdropElement = null;
  let isOpen = false;
  let previousActiveElement = null;

  // Generate unique session ID
  function generateSessionId() {
    return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  // Create panel HTML
  function createPanel() {
    if (document.getElementById(PANEL_ID)) return;

    // Backdrop
    backdropElement = document.createElement('div');
    backdropElement.id = BACKDROP_ID;
    backdropElement.className = 'nexus-backdrop';
    backdropElement.setAttribute('aria-hidden', 'true');
    backdropElement.addEventListener('click', close);

    // Panel
    panelElement = document.createElement('div');
    panelElement.id = PANEL_ID;
    panelElement.className = 'nexus-panel';
    panelElement.setAttribute('role', 'dialog');
    panelElement.setAttribute('aria-modal', 'true');
    panelElement.setAttribute('aria-labelledby', 'nexus-title');
    panelElement.setAttribute('aria-hidden', 'true');

    panelElement.innerHTML = `
      <div class="nexus-panel-header">
        <div class="nexus-panel-title-row">
          <div class="nexus-panel-branding">
            <svg class="nexus-panel-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <circle cx="12" cy="12" r="8" opacity="0.3" />
              <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
            </svg>
            <div class="nexus-panel-title-text">
              <h2 id="nexus-title" class="nexus-title">NEXUS BRAIN</h2>
              <span class="nexus-subtitle">Intelligence Interface v2.1</span>
            </div>
          </div>
          <div id="nexus-status" class="nexus-status nexus-status--loading">
            <span class="nexus-status-dot"></span>
            <span class="nexus-status-text">CONNECTING...</span>
          </div>
        </div>
        <button class="nexus-clear" aria-label="Clear history" id="nexus-clear" title="Clear chat history" style="display:none;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
        <button class="nexus-close" aria-label="Close panel" id="nexus-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="nexus-panel-messages" id="nexus-messages">
        <div class="nexus-welcome">
          <div class="nexus-welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h3 class="nexus-welcome-title">Neural Link Active</h3>
          <p class="nexus-welcome-text">Ask me anything about Barrios A2I services, architecture, or deployment options.</p>
          <div class="nexus-quick-actions">
            <button class="nexus-quick-btn" data-query="What services does Barrios A2I offer?">Services</button>
            <button class="nexus-quick-btn" data-query="Explain the pricing tiers">Pricing</button>
            <button class="nexus-quick-btn" data-query="How does the RAG system work?">RAG System</button>
          </div>
        </div>
      </div>

      <div class="nexus-panel-input-container">
        <div class="nexus-input-wrapper">
          <input
            type="text"
            id="nexus-input"
            class="nexus-input"
            placeholder="Ask Nexus..."
            autocomplete="off"
            aria-label="Message input"
          />
          <button id="nexus-send" class="nexus-send" aria-label="Send message" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13" />
              <path d="M22 2L15 22l-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
        <div class="nexus-input-hint">
          <span class="nexus-hint-key">Ctrl+K</span> to toggle &middot; <span class="nexus-hint-key">Esc</span> to close
        </div>
      </div>
    `;

    document.body.appendChild(backdropElement);
    document.body.appendChild(panelElement);

    // Event listeners
    panelElement.querySelector('#nexus-close').addEventListener('click', close);

    // P0-E: Clear history button
    panelElement.querySelector('#nexus-clear').addEventListener('click', clearChatHistory);

    const input = panelElement.querySelector('#nexus-input');
    const sendBtn = panelElement.querySelector('#nexus-send');

    input.addEventListener('input', () => {
      sendBtn.disabled = !input.value.trim();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        sendMessage(input.value.trim());
      }
    });

    sendBtn.addEventListener('click', () => {
      if (input.value.trim()) {
        sendMessage(input.value.trim());
      }
    });

    // Quick action buttons
    panelElement.querySelectorAll('.nexus-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const query = btn.getAttribute('data-query');
        if (query) sendMessage(query);
      });
    });

    // Focus trap
    panelElement.addEventListener('keydown', handleFocusTrap);

    // Start health polling
    pollHealth();
    setInterval(pollHealth, 30000);
  }

  // Focus trap handler
  function handleFocusTrap(e) {
    if (e.key !== 'Tab') return;

    const focusables = panelElement.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // Neural processing visualization
  let neuralProcessingEl = null;
  let tokenAnimationInterval = null;

  function createNeuralProcessingUI() {
    const el = document.createElement('div');
    el.className = 'nexus-neural-processing';
    el.innerHTML = `
      <div class="nexus-neural-header">
        <span class="nexus-neural-mode" id="neural-mode">...</span>
        <span class="nexus-neural-label">Neural Processing</span>
      </div>
      <div class="nexus-neural-tokens">
        <span class="nexus-token" data-token="ret">[RET]</span>
        <span class="nexus-token" data-token="rel">[REL]</span>
        <span class="nexus-token" data-token="sup">[SUP]</span>
        <span class="nexus-token" data-token="use">[USE]</span>
      </div>
      <div class="nexus-neural-progress">
        <div class="nexus-progress-bar"></div>
      </div>
    `;
    return el;
  }

  function animateTokens(processingEl) {
    const tokens = ['ret', 'rel', 'sup', 'use'];
    let i = 0;

    // Reset all tokens
    tokens.forEach(t => {
      const tokenEl = processingEl.querySelector(`[data-token="${t}"]`);
      if (tokenEl) tokenEl.classList.remove('nexus-token--active');
    });

    tokenAnimationInterval = setInterval(() => {
      if (i >= tokens.length) {
        // Loop back for continuous animation
        i = 0;
        tokens.forEach(t => {
          const tokenEl = processingEl.querySelector(`[data-token="${t}"]`);
          if (tokenEl) tokenEl.classList.remove('nexus-token--active');
        });
      }
      const tokenEl = processingEl.querySelector(`[data-token="${tokens[i]}"]`);
      if (tokenEl) tokenEl.classList.add('nexus-token--active');
      i++;
    }, 300);
  }

  function stopTokenAnimation() {
    if (tokenAnimationInterval) {
      clearInterval(tokenAnimationInterval);
      tokenAnimationInterval = null;
    }
  }

  function renderMetrics(metrics) {
    // Cognitive mode icons and descriptions
    const modeConfig = {
      'NRC': { icon: '&#9889;', title: 'Neural Response Composer - Fast Path' },
      'NQR': { icon: '&#128269;', title: 'Neural Query Router - Retrieval' },
      'NDR': { icon: '&#128209;', title: 'Neural Document Reasoner - Deep' },
      'NSC': { icon: '&#128279;', title: 'Neural Synthesis Coordinator' },
      'NAD': { icon: '&#129504;', title: 'Neural Analytical Debater - Complex' }
    };

    const mode = modeConfig[metrics.mode] || { icon: '&#128161;', title: metrics.mode };

    return `
      <div class="nexus-message-metrics">
        <span class="nexus-metric" title="Processing latency">
          <span class="nexus-metric-icon">&#9889;</span>
          <span>${metrics.latency}ms</span>
        </span>
        <span class="nexus-metric" title="Confidence score">
          <span class="nexus-metric-icon">&#127919;</span>
          <span>${Math.round(metrics.confidence * 100)}%</span>
        </span>
        <span class="nexus-metric nexus-metric--mode" title="${mode.title}">
          <span class="nexus-mode-icon">${mode.icon}</span>
          <span class="nexus-mode-text">${metrics.mode}</span>
        </span>
      </div>
    `;
  }

  // Send message with Neural RAG Brain processing
  async function sendMessage(message) {
    const input = panelElement.querySelector('#nexus-input');
    const messagesContainer = panelElement.querySelector('#nexus-messages');

    // Set status to neural processing
    updateStatus('thinking');

    // Hide welcome if visible
    const welcome = messagesContainer.querySelector('.nexus-welcome');
    if (welcome) welcome.style.display = 'none';

    // Lead Capture: Check if user message contains an email
    if (window.LeadCapture) {
      const email = window.LeadCapture.extractEmail(message);
      if (email && !window.LeadCapture.isCaptured(email)) {
        window.LeadCapture.capture({
          email: email,
          message: message.substring(0, 500),
          source: 'nexus_chat'
        });
      }
    }

    // Add user message
    const userMsg = document.createElement('div');
    userMsg.className = 'nexus-message nexus-message--user';
    userMsg.innerHTML = `
      <div class="nexus-message-content">${escapeHtml(message)}</div>
    `;
    messagesContainer.appendChild(userMsg);

    // Update clear button
    updateClearButton();

    // Clear input
    input.value = '';
    input.disabled = true;
    panelElement.querySelector('#nexus-send').disabled = true;

    // Create assistant message container
    const assistantMsg = document.createElement('div');
    assistantMsg.className = 'nexus-message nexus-message--assistant';
    assistantMsg.innerHTML = `
      <div class="nexus-message-header">
        <span class="nexus-message-label">NEXUS</span>
      </div>
      <div class="nexus-message-content"></div>
    `;
    messagesContainer.appendChild(assistantMsg);

    const contentEl = assistantMsg.querySelector('.nexus-message-content');

    // Check if Neural processing is available
    if (window.NexusChat?.processWithNeural) {
      // Show neural processing visualization
      neuralProcessingEl = createNeuralProcessingUI();
      contentEl.appendChild(neuralProcessingEl);
      animateTokens(neuralProcessingEl);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      try {
        // Process with Legendary Neural Engine
        const result = await window.NexusChat.processWithNeural(message, {
          onProcessingStart: () => {
            updateStatus('thinking');
          },
          onComplete: (metrics) => {
            // Update mode badge while still showing
            const modeEl = neuralProcessingEl?.querySelector('#neural-mode');
            if (modeEl) modeEl.textContent = metrics.mode;
          },
          onError: (error) => {
            console.warn('[NEXUS] Neural fallback:', error.message);
          }
        });

        // Stop animation and remove processing UI
        stopTokenAnimation();
        if (neuralProcessingEl) {
          neuralProcessingEl.remove();
          neuralProcessingEl = null;
        }

        // Render response
        contentEl.innerHTML = result.contentHtml;

        // Append metrics badge
        contentEl.insertAdjacentHTML('beforeend', renderMetrics(result.metrics));

        // Update status
        updateStatus('online');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

      } catch (error) {
        // Neural processing failed, fall back to standard streaming
        stopTokenAnimation();
        if (neuralProcessingEl) {
          neuralProcessingEl.remove();
          neuralProcessingEl = null;
        }

        // Show typing indicator and use standard streaming
        contentEl.classList.add('nexus-message--streaming');
        contentEl.innerHTML = `
          <span class="nexus-typing-indicator">
            <span></span><span></span><span></span>
          </span>
        `;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Fallback to standard streaming
        window.NexusChat?.stream(message, assistantMsg);
        return;
      }

      // Re-enable input
      input.disabled = false;
      input.focus();
      panelElement.querySelector('#nexus-send').disabled = true;

    } else {
      // No neural processing available, use standard streaming
      contentEl.classList.add('nexus-message--streaming');
      contentEl.innerHTML = `
        <span class="nexus-typing-indicator">
          <span></span><span></span><span></span>
        </span>
      `;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;

      // Start streaming
      window.NexusChat?.stream(message, assistantMsg);
    }
  }

  // Poll health status
  async function pollHealth() {
    const statusEl = document.getElementById('nexus-status');
    if (!statusEl) return;

    try {
      const response = await fetch(`${NEXUS_API_BASE}/health`);
      const data = await response.json();

      statusEl.className = 'nexus-status';
      // GENESIS NEXUS Brain returns: { status: "online", version: "1.0.0", ... }
      if (data.status === 'online' || response.ok) {
        statusEl.classList.add('nexus-status--online');
        statusEl.querySelector('.nexus-status-text').textContent = 'ONLINE';
      } else if (data.status === 'degraded') {
        statusEl.classList.add('nexus-status--degraded');
        statusEl.querySelector('.nexus-status-text').textContent = 'DEGRADED';
      } else {
        statusEl.classList.add('nexus-status--offline');
        statusEl.querySelector('.nexus-status-text').textContent = 'OFFLINE';
      }
    } catch (error) {
      statusEl.className = 'nexus-status nexus-status--offline';
      statusEl.querySelector('.nexus-status-text').textContent = 'OFFLINE';
    }
  }

  // Update status display (Sales-Safe states)
  function updateStatus(status) {
    const statusEl = document.getElementById('nexus-status');
    if (!statusEl) return;

    statusEl.className = 'nexus-status';
    const textEl = statusEl.querySelector('.nexus-status-text');

    switch (status) {
      case 'online':
        statusEl.classList.add('nexus-status--online');
        textEl.textContent = 'ONLINE';
        break;
      case 'thinking':
        statusEl.classList.add('nexus-status--loading');
        textEl.textContent = 'THINKING...';
        break;
      case 'working':
        statusEl.classList.add('nexus-status--loading');
        textEl.textContent = 'WORKING...';
        break;
      case 'connecting':
        statusEl.classList.add('nexus-status--loading');
        textEl.textContent = 'CONNECTING...';
        break;
      default:
        statusEl.classList.add('nexus-status--online');
        textEl.textContent = 'ONLINE';
    }
  }

  // Open panel
  function open() {
    if (isOpen) return;
    createPanel();

    previousActiveElement = document.activeElement;
    isOpen = true;

    backdropElement.classList.add('nexus-backdrop--visible');
    panelElement.classList.add('nexus-panel--open');
    panelElement.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    window.NexusLauncher?.setExpanded(true);

    // P0-E: Restore messages from previous session
    restoreMessages();
    updateClearButton();

    // Focus input after animation
    setTimeout(() => {
      panelElement.querySelector('#nexus-input').focus();
    }, 300);
  }

  // Close panel
  function close() {
    if (!isOpen) return;
    isOpen = false;

    backdropElement.classList.remove('nexus-backdrop--visible');
    panelElement.classList.remove('nexus-panel--open');
    panelElement.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';

    window.NexusLauncher?.setExpanded(false);

    // Return focus
    if (previousActiveElement) {
      previousActiveElement.focus();
    } else {
      window.NexusLauncher?.focus();
    }
  }

  // Toggle panel
  function toggle() {
    if (isOpen) {
      close();
    } else {
      open();
    }
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // P0-E: Restore messages from localStorage
  function restoreMessages() {
    if (hasRestoredMessages) return;
    hasRestoredMessages = true;

    const messages = window.NexusChat?.getStoredMessages() || [];
    if (messages.length === 0) return;

    const messagesContainer = panelElement?.querySelector('#nexus-messages');
    if (!messagesContainer) return;

    // Hide welcome message
    const welcome = messagesContainer.querySelector('.nexus-welcome');
    if (welcome) welcome.style.display = 'none';

    // Render stored messages
    messages.forEach(msg => {
      const msgEl = document.createElement('div');
      if (msg.role === 'user') {
        msgEl.className = 'nexus-message nexus-message--user';
        msgEl.innerHTML = `<div class="nexus-message-content">${escapeHtml(msg.content)}</div>`;
      } else {
        msgEl.className = 'nexus-message nexus-message--assistant';
        msgEl.innerHTML = `
          <div class="nexus-message-header">
            <span class="nexus-message-label">NEXUS</span>
          </div>
          <div class="nexus-message-content">${parseMarkdownSimple(msg.content)}</div>
        `;
      }
      messagesContainer.appendChild(msgEl);
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Show clear button
    const clearBtn = panelElement?.querySelector('#nexus-clear');
    if (clearBtn) clearBtn.style.display = 'block';
  }

  // Simple markdown parser (duplicate from nexus-chat for independence)
  function parseMarkdownSimple(text) {
    if (!text) return '';
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="nexus-inline-code">$1</code>')
      .replace(/\n/g, '<br>');
  }

  // P0-E: Clear chat history
  function clearChatHistory() {
    // Clear storage
    window.NexusChat?.clearHistory();

    // Reset UI
    const messagesContainer = panelElement?.querySelector('#nexus-messages');
    if (messagesContainer) {
      // Remove all messages
      messagesContainer.querySelectorAll('.nexus-message').forEach(m => m.remove());

      // Show welcome
      const welcome = messagesContainer.querySelector('.nexus-welcome');
      if (welcome) welcome.style.display = '';
    }

    // Hide clear button
    const clearBtn = panelElement?.querySelector('#nexus-clear');
    if (clearBtn) clearBtn.style.display = 'none';

    hasRestoredMessages = false;
  }

  // P0-E: Update clear button visibility
  function updateClearButton() {
    const messages = window.NexusChat?.getStoredMessages() || [];
    const clearBtn = panelElement?.querySelector('#nexus-clear');
    if (clearBtn) {
      clearBtn.style.display = messages.length > 0 ? 'block' : 'none';
    }
  }

  // Public API
  window.NexusPanel = {
    open,
    close,
    toggle,
    isOpen: () => isOpen,
    updateStatus,
    enableInput: function() {
      if (panelElement) {
        const input = panelElement.querySelector('#nexus-input');
        input.disabled = false;
        input.focus();
        // Reset status to online after response
        updateStatus('online');
      }
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
  } else {
    createPanel();
  }
})();
