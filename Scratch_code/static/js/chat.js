/**
 * AI CHATBOT - CLIENT LOGIC & STREAMING CHAT ENGINE
 */

document.addEventListener('DOMContentLoaded', () => {
  // App State
  const state = {
    currentConversationId: null,
    currentPersona: 'general',
    personas: [],
    conversations: [],
    isGenerating: false,
    theme: localStorage.getItem('ai_theme') || 'dark',
    recognition: null,
    isListening: false,
    promptHistory: JSON.parse(localStorage.getItem('ai_promptHistory') || '[]'),
    historyIndex: -1,
    draftInput: '',
    settings: {
      fontSize: localStorage.getItem('ai_fontSize') || 'medium',
      density: localStorage.getItem('ai_density') || 'default',
      enterToSend: localStorage.getItem('ai_enterSend') !== 'false',
      autoScroll: localStorage.getItem('ai_autoScroll') !== 'false',
      typingAnim: localStorage.getItem('ai_typingAnim') !== 'false',
      defaultPersona: localStorage.getItem('ai_defaultPersona') || 'general',
      speechLang: localStorage.getItem('ai_speechLang') || 'en-US',
      speakRate: parseFloat(localStorage.getItem('ai_speakRate') || '1.05'),
      autoSpeak: localStorage.getItem('ai_autoSpeak') === 'true'
    }
  };

  // DOM Elements
  const appContainer = document.querySelector('.app-container');
  const sidebar = document.getElementById('sidebar');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const btnCloseMobileSidebar = document.getElementById('btnCloseMobileSidebar');
  const btnNewChat = document.getElementById('btnNewChat');
  const conversationsList = document.getElementById('conversationsList');
  const btnThemeToggle = document.getElementById('btnThemeToggle');
  const themeIcon = document.getElementById('themeIcon');
  const themeText = document.getElementById('themeText');

  const personaBtn = document.getElementById('personaBtn');
  const personaIcon = document.getElementById('personaIcon');
  const personaName = document.getElementById('personaName');
  const personaDropdown = document.getElementById('personaDropdown');

  const messagesContainer = document.getElementById('messagesContainer');
  const messagesContent = document.getElementById('messagesContent');
  const emptyChatWelcome = document.getElementById('emptyChatWelcome');
  const btnClearChat = document.getElementById('btnClearChat');

  const chatTextarea = document.getElementById('chatTextarea');
  const btnSendMessage = document.getElementById('btnSendMessage');
  const btnVoiceInput = document.getElementById('btnVoiceInput');
  const toastContainer = document.getElementById('toastContainer');

  // AI Settings Modal Elements
  const btnAiSettings = document.getElementById('btnAiSettings');
  const aiStatusIcon = document.getElementById('aiStatusIcon');
  const aiStatusText = document.getElementById('aiStatusText');
  const aiSettingsModal = document.getElementById('aiSettingsModal');
  const btnCloseAiModal = document.getElementById('btnCloseAiModal');
  const btnCancelAiModal = document.getElementById('btnCancelAiModal');
  const aiKeyForm = document.getElementById('aiKeyForm');
  const geminiApiKeyInput = document.getElementById('geminiApiKeyInput');
  const btnToggleKeyVisibility = document.getElementById('btnToggleKeyVisibility');
  const aiModalStatus = document.getElementById('aiModalStatus');
  const btnSaveAiKey = document.getElementById('btnSaveAiKey');

  // Settings Modal Elements
  const settingsModal = document.getElementById('settingsModal');
  const btnOpenSettings = document.getElementById('btnOpenSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const selectFontSize = document.getElementById('selectFontSize');
  const selectDensity = document.getElementById('selectDensity');
  const selectDefaultPersona = document.getElementById('selectDefaultPersona');
  const selectSpeechLang = document.getElementById('selectSpeechLang');
  const selectSpeakRate = document.getElementById('selectSpeakRate');
  const chkEnterSend = document.getElementById('chkEnterSend');
  const chkAutoScroll = document.getElementById('chkAutoScroll');
  const chkTypingAnim = document.getElementById('chkTypingAnim');
  const chkAutoSpeak = document.getElementById('chkAutoSpeak');
  const pillDark = document.getElementById('pillDark');
  const pillLight = document.getElementById('pillLight');
  const btnClearAllHistory = document.getElementById('btnClearAllHistory');
  const btnResetSettings = document.getElementById('btnResetSettings');

  // Initialize
  initApp();

  async function initApp() {
    applyTheme(state.theme);
    applySettings(state.settings);
    setupSpeechRecognition();
    setupEventListeners();
    setupSettingsModal();
    await checkAiStatus();
    await loadPersonas();
    await loadConversations();

    // If there are existing conversations, open the latest; otherwise show empty state
    if (state.conversations.length > 0) {
      loadConversation(state.conversations[0].id);
    } else {
      showWelcomeScreen();
    }
  }

  // ===================================================================
  // EVENT LISTENERS
  // ===================================================================
  function setupEventListeners() {
    // New Chat
    btnNewChat.addEventListener('click', () => {
      startNewChat();
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('mobile-open');
      }
    });

    // Mobile Sidebar Toggle
    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        sidebar.classList.toggle('mobile-open');
      });
    }
    if (btnCloseMobileSidebar) {
      btnCloseMobileSidebar.addEventListener('click', () => {
        sidebar.classList.remove('mobile-open');
      });
    }

    // Theme Toggle
    btnThemeToggle.addEventListener('click', () => {
      const nextTheme = state.theme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme);
    });

    // Persona Dropdown Toggle
    personaBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      personaDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!personaDropdown.contains(e.target) && e.target !== personaBtn) {
        personaDropdown.classList.remove('show');
      }
    });

    // Clear Chat
    if (btnClearChat) {
      btnClearChat.addEventListener('click', handleClearChat);
    }

    // Input auto-resize
    chatTextarea.addEventListener('input', () => {
      chatTextarea.style.height = 'auto';
      chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 160) + 'px';
      btnSendMessage.disabled = !chatTextarea.value.trim() || state.isGenerating;
    });

    // Enter to send + ↑/↓ prompt history navigation
    chatTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && state.settings.enterToSend) {
        e.preventDefault();
        if (!btnSendMessage.disabled) {
          handleSendMessage();
        }
        return;
      }

      // ↑ — go back in history (only on single-line / cursor at top)
      if (e.key === 'ArrowUp' && !e.shiftKey) {
        if (state.promptHistory.length === 0) return;
        // Only intercept when cursor is on the first line
        const cursorPos = chatTextarea.selectionStart;
        const textBefore = chatTextarea.value.slice(0, cursorPos);
        if (textBefore.includes('\n')) return; // multi-line: let browser handle
        e.preventDefault();
        if (state.historyIndex === -1) {
          // Save current draft so we can restore it if user arrows back down
          state.draftInput = chatTextarea.value;
        }
        const nextIdx = Math.min(state.historyIndex + 1, state.promptHistory.length - 1);
        state.historyIndex = nextIdx;
        chatTextarea.value = state.promptHistory[nextIdx];
        chatTextarea.style.height = 'auto';
        chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 160) + 'px';
        btnSendMessage.disabled = !chatTextarea.value.trim() || state.isGenerating;
        // Move cursor to end
        chatTextarea.selectionStart = chatTextarea.selectionEnd = chatTextarea.value.length;
        return;
      }

      // ↓ — go forward in history
      if (e.key === 'ArrowDown' && !e.shiftKey && state.historyIndex > -1) {
        const cursorPos = chatTextarea.selectionStart;
        const textAfter = chatTextarea.value.slice(cursorPos);
        if (textAfter.includes('\n')) return; // multi-line: let browser handle
        e.preventDefault();
        const prevIdx = state.historyIndex - 1;
        state.historyIndex = prevIdx;
        chatTextarea.value = prevIdx === -1 ? state.draftInput : state.promptHistory[prevIdx];
        chatTextarea.style.height = 'auto';
        chatTextarea.style.height = Math.min(chatTextarea.scrollHeight, 160) + 'px';
        btnSendMessage.disabled = !chatTextarea.value.trim() || state.isGenerating;
        chatTextarea.selectionStart = chatTextarea.selectionEnd = chatTextarea.value.length;
        return;
      }
    });

    // Send Button
    btnSendMessage.addEventListener('click', handleSendMessage);

    // Voice Input Button
    if (btnVoiceInput) {
      btnVoiceInput.addEventListener('click', toggleVoiceInput);
    }

    // Starter Prompt Cards
    document.querySelectorAll('.starter-prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        const prompt = card.dataset.prompt;
        if (prompt) {
          chatTextarea.value = prompt;
          btnSendMessage.disabled = false;
          handleSendMessage();
        }
      });
    });

    // AI Settings Modal
    if (btnAiSettings) {
      btnAiSettings.addEventListener('click', () => {
        aiModalStatus.style.display = 'none';
        aiSettingsModal.classList.add('active');
        geminiApiKeyInput.focus();
      });
    }

    if (btnCloseAiModal) {
      btnCloseAiModal.addEventListener('click', () => {
        aiSettingsModal.classList.remove('active');
      });
    }

    if (btnCancelAiModal) {
      btnCancelAiModal.addEventListener('click', () => {
        aiSettingsModal.classList.remove('active');
      });
    }

    if (btnToggleKeyVisibility) {
      btnToggleKeyVisibility.addEventListener('click', () => {
        const isPass = geminiApiKeyInput.type === 'password';
        geminiApiKeyInput.type = isPass ? 'text' : 'password';
        btnToggleKeyVisibility.textContent = isPass ? '🙈' : '👁️';
      });
    }

    if (aiKeyForm) {
      aiKeyForm.addEventListener('submit', handleSaveAiKey);
    }
  }

  // ===================================================================
  // AI STATUS & SETTINGS  (Puter.js — no API key required)
  // ===================================================================
  async function checkAiStatus() {
    // puter.js is loaded via CDN — always available, no key needed
    const puterReady = typeof puter !== 'undefined' && puter.ai;
    if (btnAiSettings) {
      btnAiSettings.classList.add('connected');
      aiStatusIcon.textContent = '⚡';
      aiStatusText.textContent = puterReady ? 'Puter AI Active' : 'Local AI Active';
      btnAiSettings.title = puterReady
        ? 'Powered by Puter.js — free AI, no API key needed'
        : 'Using built-in local AI engine';
    }
  }

  // (Legacy key-save handler kept but no longer wired to the form)
  async function handleSaveAiKey(e) {
    if (e) e.preventDefault();
    if (aiSettingsModal) aiSettingsModal.classList.remove('active');
  }

  // ===================================================================
  // THEME MANAGEMENT
  // ===================================================================
  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('ai_theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (themeIcon && themeText) {
      themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
      themeText.textContent = theme === 'dark' ? 'Light Mode' : 'Dark Mode';
    }
    // Sync theme pills in settings if modal is open
    if (pillDark && pillLight) {
      pillDark.classList.toggle('active', theme === 'dark');
      pillLight.classList.toggle('active', theme === 'light');
    }
  }

  // ===================================================================
  // SETTINGS MODAL
  // ===================================================================
  function applySettings(s) {
    // Font size
    const sizeMap = { small: '14px', medium: '15px', large: '17px', xlarge: '19px' };
    document.documentElement.style.setProperty('--msg-font-size', sizeMap[s.fontSize] || '15px');

    // Density (gap between message rows)
    const gapMap = { compact: '14px', default: '22px', spacious: '34px' };
    document.documentElement.style.setProperty('--msg-gap', gapMap[s.density] || '22px');
  }

  function saveSettings() {
    const s = state.settings;
    localStorage.setItem('ai_fontSize', s.fontSize);
    localStorage.setItem('ai_density', s.density);
    localStorage.setItem('ai_enterSend', s.enterToSend);
    localStorage.setItem('ai_autoScroll', s.autoScroll);
    localStorage.setItem('ai_typingAnim', s.typingAnim);
    localStorage.setItem('ai_defaultPersona', s.defaultPersona);
    localStorage.setItem('ai_speechLang', s.speechLang);
    localStorage.setItem('ai_speakRate', s.speakRate);
    localStorage.setItem('ai_autoSpeak', s.autoSpeak);
    applySettings(s);
  }

  function syncSettingsUI() {
    const s = state.settings;
    if (selectFontSize) selectFontSize.value = s.fontSize;
    if (selectDensity) selectDensity.value = s.density;
    if (selectSpeechLang) selectSpeechLang.value = s.speechLang;
    if (selectSpeakRate) selectSpeakRate.value = String(s.speakRate);
    if (chkEnterSend) chkEnterSend.checked = s.enterToSend;
    if (chkAutoScroll) chkAutoScroll.checked = s.autoScroll;
    if (chkTypingAnim) chkTypingAnim.checked = s.typingAnim;
    if (chkAutoSpeak) chkAutoSpeak.checked = s.autoSpeak;
    if (pillDark) pillDark.classList.toggle('active', state.theme === 'dark');
    if (pillLight) pillLight.classList.toggle('active', state.theme === 'light');
    // Populate default persona select
    if (selectDefaultPersona && state.personas.length > 0) {
      selectDefaultPersona.innerHTML = '';
      state.personas.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.icon} ${p.name}`;
        if (p.id === s.defaultPersona) opt.selected = true;
        selectDefaultPersona.appendChild(opt);
      });
    }
  }

  function setupSettingsModal() {
    if (!settingsModal) return;

    // Open / Close
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener('click', () => {
        syncSettingsUI();
        settingsModal.classList.add('active');
      });
    }
    if (btnCloseSettings) {
      btnCloseSettings.addEventListener('click', () => settingsModal.classList.remove('active'));
    }
    // Click outside to close
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) settingsModal.classList.remove('active');
    });

    // Tab switching
    settingsModal.querySelectorAll('.settings-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        settingsModal.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
        settingsModal.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = settingsModal.querySelector(`#tab-${tab.dataset.tab}`);
        if (panel) panel.classList.add('active');
      });
    });

    // Theme pills
    if (pillDark) pillDark.addEventListener('click', () => applyTheme('dark'));
    if (pillLight) pillLight.addEventListener('click', () => applyTheme('light'));

    // Font size
    if (selectFontSize) {
      selectFontSize.addEventListener('change', () => {
        state.settings.fontSize = selectFontSize.value;
        saveSettings();
      });
    }

    // Density
    if (selectDensity) {
      selectDensity.addEventListener('change', () => {
        state.settings.density = selectDensity.value;
        saveSettings();
      });
    }

    // Enter to send toggle
    if (chkEnterSend) {
      chkEnterSend.addEventListener('change', () => {
        state.settings.enterToSend = chkEnterSend.checked;
        saveSettings();
      });
    }

    // Auto scroll
    if (chkAutoScroll) {
      chkAutoScroll.addEventListener('change', () => {
        state.settings.autoScroll = chkAutoScroll.checked;
        saveSettings();
      });
    }

    // Typing animation
    if (chkTypingAnim) {
      chkTypingAnim.addEventListener('change', () => {
        state.settings.typingAnim = chkTypingAnim.checked;
        saveSettings();
      });
    }

    // Default persona
    if (selectDefaultPersona) {
      selectDefaultPersona.addEventListener('change', () => {
        state.settings.defaultPersona = selectDefaultPersona.value;
        saveSettings();
      });
    }

    // Speech language
    if (selectSpeechLang) {
      selectSpeechLang.addEventListener('change', () => {
        state.settings.speechLang = selectSpeechLang.value;
        if (state.recognition) state.recognition.lang = selectSpeechLang.value;
        saveSettings();
      });
    }

    // Speak rate
    if (selectSpeakRate) {
      selectSpeakRate.addEventListener('change', () => {
        state.settings.speakRate = parseFloat(selectSpeakRate.value);
        saveSettings();
      });
    }

    // Auto speak
    if (chkAutoSpeak) {
      chkAutoSpeak.addEventListener('change', () => {
        state.settings.autoSpeak = chkAutoSpeak.checked;
        saveSettings();
      });
    }

    // Clear all conversations
    if (btnClearAllHistory) {
      btnClearAllHistory.addEventListener('click', async () => {
        if (!confirm('Delete ALL conversation history? This cannot be undone.')) return;
        try {
          const convIds = state.conversations.map(c => c.id);
          await Promise.all(convIds.map(id => fetch(`/api/conversations/${id}`, { method: 'DELETE' })));
          state.conversations = [];
          state.currentConversationId = null;
          renderConversationsList([]);
          showWelcomeScreen();
          showToast('🗑️ All conversations deleted');
        } catch (err) {
          console.error(err);
          showToast('⚠️ Failed to delete conversations');
        }
      });
    }

    // Reset settings
    if (btnResetSettings) {
      btnResetSettings.addEventListener('click', () => {
        if (!confirm('Reset all settings to defaults?')) return;
        ['ai_fontSize','ai_density','ai_enterSend','ai_autoScroll','ai_typingAnim',
         'ai_defaultPersona','ai_speechLang','ai_speakRate','ai_autoSpeak','ai_theme'].forEach(k => localStorage.removeItem(k));
        state.settings = {
          fontSize: 'medium', density: 'default', enterToSend: true, autoScroll: true,
          typingAnim: true, defaultPersona: 'general', speechLang: 'en-US', speakRate: 1.05, autoSpeak: false
        };
        applyTheme('dark');
        saveSettings();
        syncSettingsUI();
        showToast('↺ Settings reset to defaults');
      });
    }
  }

  // ===================================================================
  // PERSONAS MANAGEMENT
  // ===================================================================
  async function loadPersonas() {
    try {
      const res = await fetch('/api/personas');
      const personas = await res.json();
      state.personas = personas;
      renderPersonaDropdown(personas);

      const active = personas.find(p => p.id === state.currentPersona) || personas[0];
      setPersona(active);
    } catch (err) {
      console.error('Failed to load personas:', err);
    }
  }

  function renderPersonaDropdown(personas) {
    personaDropdown.innerHTML = '';
    personas.forEach(p => {
      const item = document.createElement('div');
      item.className = `persona-option-item ${p.id === state.currentPersona ? 'selected' : ''}`;
      item.innerHTML = `
        <span class="persona-option-icon">${p.icon}</span>
        <div>
          <div class="persona-option-name">${p.name}</div>
          <div class="persona-option-desc">${p.tagline}</div>
        </div>
      `;
      item.addEventListener('click', () => {
        setPersona(p);
        personaDropdown.classList.remove('show');
      });
      personaDropdown.appendChild(item);
    });
  }

  function setPersona(persona) {
    state.currentPersona = persona.id;
    personaIcon.textContent = persona.icon;
    personaName.textContent = persona.name;
    document.querySelectorAll('.persona-option-item').forEach(item => {
      item.classList.toggle('selected', item.textContent.includes(persona.name));
    });
  }

  // ===================================================================
  // CONVERSATIONS & SESSIONS
  // ===================================================================
  async function loadConversations() {
    try {
      const res = await fetch('/api/conversations');
      const convs = await res.json();
      state.conversations = convs;
      renderConversationsList(convs);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    }
  }

  function renderConversationsList(conversations) {
    conversationsList.innerHTML = '';

    if (!conversations || conversations.length === 0) {
      conversationsList.innerHTML = '<div style="font-size: 0.8rem; color: var(--text-muted); padding: 12px 10px;">No previous chats yet.</div>';
      return;
    }

    const titleHeader = document.createElement('div');
    titleHeader.className = 'conv-section-title';
    titleHeader.textContent = 'Recent Chats';
    conversationsList.appendChild(titleHeader);

    conversations.forEach(c => {
      const item = document.createElement('div');
      item.className = `conv-item ${c.id === state.currentConversationId ? 'active' : ''}`;
      item.innerHTML = `
        <span class="conv-item-title" title="${escapeHtml(c.title)}">💬 ${escapeHtml(c.title)}</span>
        <div class="conv-actions">
          <button class="btn-conv-action btn-delete-conv" title="Delete conversation">✕</button>
        </div>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete-conv')) return;
        loadConversation(c.id);
        if (window.innerWidth <= 768) {
          sidebar.classList.remove('mobile-open');
        }
      });

      const btnDelete = item.querySelector('.btn-delete-conv');
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteConversation(c.id);
      });

      conversationsList.appendChild(item);
    });
  }

  function startNewChat() {
    state.currentConversationId = null;
    showWelcomeScreen();
    document.querySelectorAll('.conv-item').forEach(i => i.classList.remove('active'));
    chatTextarea.focus();
  }

  async function loadConversation(convId) {
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (!res.ok) throw new Error('Conversation not found');
      const conv = await res.json();

      state.currentConversationId = conv.id;
      if (conv.persona) {
        const p = state.personas.find(x => x.id === conv.persona);
        if (p) setPersona(p);
      }

      document.querySelectorAll('.conv-item').forEach(item => {
        item.classList.toggle('active', item.querySelector('.conv-item-title').textContent.includes(conv.title));
      });

      renderMessages(conv.messages);
    } catch (err) {
      console.error('Failed to load conversation:', err);
      startNewChat();
    }
  }

  async function handleDeleteConversation(convId) {
    try {
      await fetch(`/api/conversations/${convId}`, { method: 'DELETE' });
      state.conversations = state.conversations.filter(c => c.id !== convId);
      renderConversationsList(state.conversations);

      if (state.currentConversationId === convId) {
        if (state.conversations.length > 0) {
          loadConversation(state.conversations[0].id);
        } else {
          startNewChat();
        }
      }
      showToast('Conversation deleted');
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  }

  async function handleClearChat() {
    if (!state.currentConversationId) {
      showWelcomeScreen();
      return;
    }

    try {
      await fetch(`/api/conversations/${state.currentConversationId}/clear`, { method: 'POST' });
      showWelcomeScreen();
      showToast('Chat history cleared');
    } catch (err) {
      console.error('Failed to clear chat:', err);
    }
  }

  // ===================================================================
  // MESSAGE RENDERING & STREAMING
  // ===================================================================
  function showWelcomeScreen() {
    messagesContent.innerHTML = '';
    messagesContent.appendChild(emptyChatWelcome);
    emptyChatWelcome.style.display = 'flex';
  }

  function renderMessages(messages) {
    messagesContent.innerHTML = '';
    if (!messages || messages.length === 0) {
      showWelcomeScreen();
      return;
    }
    emptyChatWelcome.style.display = 'none';

    messages.forEach(msg => {
      appendMessageToDOM(msg.role, msg.content, false);
    });
    scrollToBottom();
  }

  function appendMessageToDOM(role, content, isStreaming = false) {
    emptyChatWelcome.style.display = 'none';

    const row = document.createElement('div');
    row.className = `message-row ${role}`;

    if (role === 'user') {
      row.innerHTML = `
        <div class="message-bubble user-bubble">${escapeHtml(content)}</div>
      `;
    } else {
      const persona = state.personas.find(p => p.id === state.currentPersona) || { name: 'Assistant', icon: '✨' };
      row.innerHTML = `
        <div class="message-avatar" style="background: ${persona.avatar_bg || 'var(--accent-gradient)'};">
          ${persona.icon || '✨'}
        </div>
        <div class="message-content-box">
          <div class="message-author-header">
            <span>${persona.name}</span>
          </div>
          <div class="message-bubble assistant-bubble">${renderMarkdown(content)}</div>
          <div class="message-actions-toolbar">
            <button class="btn-msg-action btn-copy-msg" title="Copy response">📋 Copy</button>
            <button class="btn-msg-action btn-speak-msg" title="Read aloud">🔊 Speak</button>
          </div>
        </div>
      `;

      // Copy response text
      const copyBtn = row.querySelector('.btn-copy-msg');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
      });

      // Speak response aloud
      const speakBtn = row.querySelector('.btn-speak-msg');
      speakBtn.addEventListener('click', () => {
        speakText(content);
      });
    }

    // Attach code copy buttons
    row.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const codeText = e.currentTarget.closest('.code-block-wrapper').querySelector('code').textContent;
        navigator.clipboard.writeText(codeText);
        btn.textContent = '✓ Copied';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      });
    });

    messagesContent.appendChild(row);
    scrollToBottom();
    return row;
  }

  // ===================================================================
  // CHAT SEND — Puter.js AI (free, no API key) with Flask fallback
  // ===================================================================

  // Build the persona system prefix for puter.ai
  function buildSystemPrefix(personaId) {
    const persona = state.personas.find(p => p.id === personaId);
    if (!persona) return '';
    return `[You are ${persona.name}. ${persona.tagline}. Stay fully in character.] `;
  }

  async function handleSendMessage() {
    const text = chatTextarea.value.trim();
    if (!text || state.isGenerating) return;

    // Reset input
    chatTextarea.value = '';
    chatTextarea.style.height = 'auto';
    btnSendMessage.disabled = true;
    state.isGenerating = true;

    // Save prompt to history list (for ↑/↓ navigation)
    state.promptHistory.unshift(text);
    if (state.promptHistory.length > 50) state.promptHistory.pop();
    localStorage.setItem('ai_promptHistory', JSON.stringify(state.promptHistory));
    state.historyIndex = -1;
    state.draftInput = '';

    // Show user bubble
    appendMessageToDOM('user', text);

    // Show typing indicator
    const typingIndicator = createTypingIndicator();
    messagesContent.appendChild(typingIndicator);
    scrollToBottom();

    if (typeof puter !== 'undefined' && puter.ai && puter.ai.chat) {
      try {
        const systemPrefix = buildSystemPrefix(state.currentPersona);
        
        // Build conversation history context
        let historyContext = '';
        const domBubbles = messagesContent.querySelectorAll('.message-row:not(.typing-row)');
        const pastMsgs = [];
        domBubbles.forEach(row => {
          if (row.classList.contains('user')) {
            const uText = row.querySelector('.user-bubble')?.textContent?.trim();
            if (uText) pastMsgs.push(`User: ${uText}`);
          } else if (row.classList.contains('assistant')) {
            const aText = row.querySelector('.assistant-bubble')?.textContent?.trim();
            if (aText) pastMsgs.push(`Assistant: ${aText}`);
          }
        });
        
        // Take up to the last 10 messages before current text
        if (pastMsgs.length > 1) {
          const recentHistory = pastMsgs.slice(-11, -1);
          if (recentHistory.length > 0) {
            historyContext = `[Prior Conversation History]:\n${recentHistory.join('\n')}\n\n`;
          }
        }

        const fullPrompt = systemPrefix + historyContext + `User: ${text}`;

        const response = await puter.ai.chat(fullPrompt, { stream: true });
        typingIndicator.remove();

        const persona = state.personas.find(p => p.id === state.currentPersona) || { name: 'Assistant', icon: '✨' };
        const row = document.createElement('div');
        row.className = 'message-row assistant';
        row.innerHTML = `
          <div class="message-avatar" style="background: ${persona.avatar_bg || 'var(--accent-gradient)'}">
            ${persona.icon || '✨'}
          </div>
          <div class="message-content-box">
            <div class="message-author-header"><span>${persona.name}</span></div>
            <div class="message-bubble assistant-bubble"></div>
            <div class="message-actions-toolbar" style="opacity:0">
              <button class="btn-msg-action btn-copy-msg" title="Copy">📋 Copy</button>
              <button class="btn-msg-action btn-speak-msg" title="Read aloud">🔊 Speak</button>
            </div>
          </div>
        `;
        messagesContent.appendChild(row);
        const bubble = row.querySelector('.assistant-bubble');
        const actions = row.querySelector('.message-actions-toolbar');

        let fullText = '';
        for await (const part of response) {
          const token = part?.text ?? part?.choices?.[0]?.delta?.content ?? '';
          fullText += token;
          bubble.innerHTML = renderMarkdown(fullText);
          scrollToBottom();
        }

        bubble.innerHTML = renderMarkdown(fullText);
        actions.style.opacity = '1';

        row.querySelector('.btn-copy-msg').addEventListener('click', () => {
          navigator.clipboard.writeText(fullText);
        });
        row.querySelector('.btn-speak-msg').addEventListener('click', () => speakText(fullText));

        // Save to Flask history (best-effort)
        try {
          const saveRes = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversation_id: state.currentConversationId,
              message: text,
              persona: state.currentPersona,
              prefetched_response: fullText
            })
          });
          const saveData = await saveRes.json();
          if (saveData.conversation_id) {
            state.currentConversationId = saveData.conversation_id;
          }
        } catch (_) { /* best-effort */ }

        await loadConversations();

      } catch (puterErr) {
        console.warn('[Puter AI] failed, using local engine:', puterErr);
        typingIndicator.remove();
        const ti2 = createTypingIndicator();
        messagesContent.appendChild(ti2);
        scrollToBottom();
        await flaskFallback(text, ti2);
      } finally {
        // ALWAYS re-enable input regardless of success/failure
        state.isGenerating = false;
        btnSendMessage.disabled = !chatTextarea.value.trim();
        chatTextarea.focus();
      }

    } else {
      // ----------------------------------------------------------------
      // STRATEGY 2: Flask local engine (no puter.js)
      // ----------------------------------------------------------------
      await flaskFallback(text, typingIndicator);
    }
  }

  async function flaskFallback(text, typingIndicator) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: state.currentConversationId,
          message: text,
          persona: state.currentPersona
        })
      });

      const data = await response.json();
      typingIndicator.remove();

      if (data.error) {
        appendMessageToDOM('assistant', `⚠️ **Error:** ${data.error}`);
        return;
      }

      state.currentConversationId = data.conversation_id;
      await streamAssistantMessage(data.assistant_message.content);
      await loadConversations();
    } catch (err) {
      console.error('Flask fallback error:', err);
      typingIndicator.remove();
      appendMessageToDOM('assistant', '⚠️ **Error:** Could not connect. Is the Python server running?');
    } finally {
      state.isGenerating = false;
      btnSendMessage.disabled = !chatTextarea.value.trim();
      chatTextarea.focus();
    }
  }

  function createTypingIndicator() {
    const row = document.createElement('div');
    row.className = 'message-row assistant typing-row';
    const persona = state.personas.find(p => p.id === state.currentPersona) || { icon: '✨' };
    row.innerHTML = `
      <div class="message-avatar">${persona.icon || '✨'}</div>
      <div class="message-content-box">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    `;
    return row;
  }

  /**
   * Smooth word-by-word streaming effect
   */
  async function streamAssistantMessage(fullContent) {
    const persona = state.personas.find(p => p.id === state.currentPersona) || { name: 'Assistant', icon: '✨' };
    const row = document.createElement('div');
    row.className = 'message-row assistant';
    row.innerHTML = `
      <div class="message-avatar" style="background: ${persona.avatar_bg || 'var(--accent-gradient)'};">
        ${persona.icon || '✨'}
      </div>
      <div class="message-content-box">
        <div class="message-author-header">
          <span>${persona.name}</span>
        </div>
        <div class="message-bubble assistant-bubble"></div>
        <div class="message-actions-toolbar" style="opacity: 0;">
          <button class="btn-msg-action btn-copy-msg" title="Copy response">📋 Copy</button>
          <button class="btn-msg-action btn-speak-msg" title="Read aloud">🔊 Speak</button>
        </div>
      </div>
    `;
    messagesContent.appendChild(row);

    const bubble = row.querySelector('.assistant-bubble');
    const actions = row.querySelector('.message-actions-toolbar');

    // Split words
    const words = fullContent.split(' ');
    let currentText = '';

    for (let i = 0; i < words.length; i++) {
      currentText += (i === 0 ? '' : ' ') + words[i];
      bubble.innerHTML = renderMarkdown(currentText);
      scrollToBottom();
      // Fast typing delay (12-25ms)
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 15) + 10));
    }

    // Final render to ensure clean markdown tags
    bubble.innerHTML = renderMarkdown(fullContent);
    actions.style.opacity = '1';

    // Hook copy and speak actions
    const copyBtn = row.querySelector('.btn-copy-msg');
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(fullContent);
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => copyBtn.textContent = '📋 Copy', 2000);
    });

    const speakBtn = row.querySelector('.btn-speak-msg');
    speakBtn.addEventListener('click', () => {
      speakText(fullContent);
    });

    row.querySelectorAll('.btn-copy-code').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const codeText = e.currentTarget.closest('.code-block-wrapper').querySelector('code').textContent;
        navigator.clipboard.writeText(codeText);
        btn.textContent = '✓ Copied';
        setTimeout(() => btn.textContent = 'Copy', 2000);
      });
    });

    scrollToBottom();
  }

  // ===================================================================
  // LIGHTWEIGHT ROBUST MARKDOWN PARSER
  // ===================================================================
  function renderMarkdown(md) {
    if (!md) return '';

    // Extract code blocks first to protect them from regex replacements
    const codeBlocks = [];
    let text = md.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      const language = lang || 'code';
      const cleanCode = escapeHtml(code.trim());
      codeBlocks.push(`
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span>${language}</span>
            <button class="btn-copy-code">Copy</button>
          </div>
          <pre class="code-block-body"><code>${cleanCode}</code></pre>
        </div>
      `);
      return `__CODE_BLOCK_${idx}__`;
    });

    // Headers
    text = text.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Blockquotes
    text = text.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // Bold & Italics
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Inline Code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bullet Lists
    text = text.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
    text = text.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');

    // Numbered Lists
    text = text.replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>');

    // Paragraphs
    const paragraphs = text.split(/\n\n+/);
    text = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<ul>') || p.startsWith('<blockquote>') || p.startsWith('__CODE_BLOCK_')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Restore Code Blocks
    codeBlocks.forEach((blockHtml, idx) => {
      text = text.replace(`__CODE_BLOCK_${idx}__`, blockHtml);
    });

    return text;
  }

  // ===================================================================
  // SPEECH RECOGNITION & SYNTHESIS
  // ===================================================================
  function setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      state.recognition = new SpeechRecognition();
      state.recognition.continuous = false;
      state.recognition.interimResults = false;
      state.recognition.lang = 'en-US';

      state.recognition.onstart = () => {
        state.isListening = true;
        btnVoiceInput.classList.add('listening');
        showToast('🎙️ Listening... Speak now');
      };

      state.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        chatTextarea.value = (chatTextarea.value ? chatTextarea.value + ' ' : '') + transcript;
        btnSendMessage.disabled = false;
        chatTextarea.focus();
      };

      state.recognition.onend = () => {
        state.isListening = false;
        btnVoiceInput.classList.remove('listening');
      };

      state.recognition.onerror = () => {
        state.isListening = false;
        btnVoiceInput.classList.remove('listening');
        showToast('Voice input error or permission denied');
      };
    } else {
      if (btnVoiceInput) btnVoiceInput.style.display = 'none';
    }
  }

  function toggleVoiceInput() {
    if (!state.recognition) return;
    if (state.isListening) {
      state.recognition.stop();
    } else {
      state.recognition.start();
    }
  }

  function speakText(text) {
    if (!window.speechSynthesis) {
      showToast('Speech synthesis not supported in this browser');
      return;
    }
    window.speechSynthesis.cancel();
    // Strip markdown formatting for cleaner speech
    const clean = text.replace(/[#*`_>]/g, '').replace(/```[\s\S]*?```/g, 'Code block omitted.');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = state.settings.speakRate;
    window.speechSynthesis.speak(utterance);
    showToast('🔊 Reading response aloud...');
  }

  // ===================================================================
  // UTILITIES
  // ===================================================================
  function scrollToBottom() {
    if (state.settings.autoScroll) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 2800);
  }
});
