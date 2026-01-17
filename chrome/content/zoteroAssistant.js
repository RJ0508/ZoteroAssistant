/**
 * Zotero AI Assistant - Main Plugin Module
 * 
 * This module handles the core functionality of the plugin,
 * including UI management, authentication, and AI interactions.
 */

var ZoteroAIAssistant = {
  // Plugin metadata
  id: null,
  version: null,
  rootURI: null,
  
  // Registered components
  registeredSectionID: null,
  registeredMenuItems: [],
  registeredShortcuts: [],
  
  // Module references (loaded dynamically)
  modules: {
    tokenStorage: null,
    githubDeviceFlow: null,
    copilotClient: null,
    modelRegistry: null,
    pdfReader: null,
    chatManager: null,
    paperActions: null
  },
  
  // State
  initialized: false,
  
  /**
   * Initialize the plugin with metadata
   */
  init({ id, version, rootURI }) {
    this.id = id;
    this.version = version;
    this.rootURI = rootURI;
    
    Zotero.debug("ZoteroAIAssistant: Initializing with rootURI: " + rootURI);
  },
  
  /**
   * Main initialization - load modules and setup
   */
  async main() {
    if (this.initialized) return;
    
    Zotero.debug("ZoteroAIAssistant: Running main initialization");
    
    try {
      // Load all service modules
      await this.loadModules();
      
      // Initialize PDF Reader integration
      if (ZoteroAIAssistant.PDFReader) {
        ZoteroAIAssistant.PDFReader.init();
        Zotero.debug("ZoteroAIAssistant: PDFReader initialized");
      }
      
      // Register preference pane
      this.registerPreferencePane();
      
      // Register keyboard shortcut
      this.registerKeyboardShortcut();
      
      this.initialized = true;
      Zotero.debug("ZoteroAIAssistant: Initialization complete");
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant: Initialization failed: " + error);
      throw error;
    }
  },
  
  /**
   * Load all service modules
   */
  async loadModules() {
    const modulePaths = {
      // Auth modules
      tokenStorage: "services/auth/tokenStorage.js",
      githubDeviceFlow: "services/auth/githubDeviceFlow.js",
      // AI modules
      copilotClient: "services/ai/copilotClient.js",
      modelRegistry: "services/ai/modelRegistry.js",
      localModelClient: "services/ai/localModelClient.js",
      // UI modules
      sidebar: "ui/sidebar.js",
      // Core modules
      conversationStorage: "modules/conversationStorage.js",
      annotationManager: "modules/annotationManager.js",
      exportHelper: "modules/exportHelper.js",
      citationHelper: "modules/citationHelper.js",
      paperComparison: "modules/paperComparison.js",
      notesManager: "modules/notesManager.js",
      batchProcessor: "modules/batchProcessor.js",
      pdfReader: "modules/pdfReader.js",
      chatManager: "modules/chatManager.js",
      paperActions: "modules/paperActions.js"
    };
    
    for (const [name, path] of Object.entries(modulePaths)) {
      try {
        Services.scriptloader.loadSubScript(this.rootURI + "chrome/content/" + path);
        Zotero.debug("ZoteroAIAssistant: Loaded module: " + name);
      } catch (error) {
        Zotero.debug("ZoteroAIAssistant: Failed to load module " + name + ": " + error);
        // Continue loading other modules
      }
    }
  },
  
  /**
   * Register the preference pane
   */
  registerPreferencePane() {
    Zotero.PreferencePanes.register({
      pluginID: this.id,
      src: this.rootURI + "chrome/content/ui/preferences.xhtml",
      scripts: [this.rootURI + "chrome/content/ui/preferences.js"],
      stylesheets: [this.rootURI + "chrome/skin/default/zotero-assistant.css"],
      label: "AI Assistant",
      image: this.rootURI + "chrome/skin/default/icons/icon-16.svg"
    });
  },
  
  /**
   * Register the keyboard shortcut (Ctrl+Shift+Z)
   */
  registerKeyboardShortcut() {
    // Keyboard shortcuts are registered per-window in addToWindow
  },
  
  /**
   * Add plugin UI to all open windows
   */
  addToAllWindows() {
    const windows = Zotero.getMainWindows();
    for (const win of windows) {
      if (!win.ZoteroPane) continue;
      this.addToWindow(win);
    }
  },
  
  /**
   * Add plugin UI to a specific window
   */
  addToWindow(window) {
    Zotero.debug("ZoteroAIAssistant: Adding to window");
    
    // Note: FTL localization is optional - UI uses hardcoded strings as fallback
    // The "Missing resource in locale" warnings are non-critical and can be ignored
    
    // Add stylesheet
    const doc = window.document;
    if (!doc.getElementById("zotero-ai-assistant-styles")) {
      const link = doc.createElement("link");
      link.id = "zotero-ai-assistant-styles";
      link.rel = "stylesheet";
      link.type = "text/css";
      link.href = this.rootURI + "chrome/skin/default/zotero-assistant.css";
      doc.documentElement.appendChild(link);
    }
    
    // Register the sidebar section in item pane
    this.registerSidebarSection(window);
    
    // Add menu items
    this.addMenuItems(window);
    
    // Register keyboard shortcut
    this.addKeyboardShortcut(window);
  },
  
  /**
   * Register the AI Assistant sidebar section
   */
  registerSidebarSection(window) {
    Zotero.debug("ZoteroAIAssistant: registerSidebarSection called, existing ID: " + this.registeredSectionID);
    
    if (this.registeredSectionID) {
      Zotero.debug("ZoteroAIAssistant: Section already registered, skipping");
      return;
    }
    
    // Check if ItemPaneManager exists
    if (!Zotero.ItemPaneManager) {
      Zotero.debug("ZoteroAIAssistant: Zotero.ItemPaneManager not available");
      return;
    }
    
    Zotero.debug("ZoteroAIAssistant: Attempting to register section...");
    
    try {
      this.registeredSectionID = Zotero.ItemPaneManager.registerSection({
        paneID: "zotero-ai-assistant-section",
        pluginID: this.id,
        header: {
          l10nID: "zotero-ai-assistant-section-header",
          icon: this.rootURI + "chrome/skin/default/icons/icon-16.svg"
        },
        sidenav: {
          l10nID: "zotero-ai-assistant-section-sidenav",
          icon: this.rootURI + "chrome/skin/default/icons/icon-20.svg"
        },
        onInit: ({ paneID, doc, body, item, refresh }) => {
          Zotero.debug("ZoteroAIAssistant: Section onInit called");
          // Inject CSS if not already present
          if (!doc.getElementById("zotero-ai-assistant-styles")) {
            const link = doc.createElement("link");
            link.id = "zotero-ai-assistant-styles";
            link.rel = "stylesheet";
            link.href = ZoteroAIAssistant.rootURI + "chrome/skin/default/zotero-assistant.css";
            doc.head.appendChild(link);
          }
        },
        onDestroy: ({ paneID, doc, body }) => {
          Zotero.debug("ZoteroAIAssistant: Section onDestroy");
        },
        onItemChange: ({ paneID, doc, body, item, tabType, editable, setEnabled }) => {
          Zotero.debug("ZoteroAIAssistant: Section onItemChange, item: " + (item ? item.id : "null"));
          const isRegular = item?.isRegularItem?.();
          const isAttachment = item?.isAttachment?.() || item?.isPDFAttachment?.();
          setEnabled(!!(isRegular || isAttachment));
        },
        onRender: ({ body, item, editable, tabType }) => {
          Zotero.debug("ZoteroAIAssistant: Section onRender called");
          this.renderSidebarContent(body, item);
        },
        onAsyncRender: async ({ body, item }) => {
          Zotero.debug("ZoteroAIAssistant: Section onAsyncRender called");
          await this.asyncRenderSidebarContent(body, item);
        },
        sectionButtons: [
          {
            type: "settings",
            icon: this.rootURI + "chrome/skin/default/icons/settings.svg",
            onClick: ({ paneID, doc, body }) => {
              this.openPreferences();
            }
          }
        ]
      });
      
      Zotero.debug("ZoteroAIAssistant: Registered sidebar section with ID: " + this.registeredSectionID);
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant: Failed to register sidebar section: " + error);
      Zotero.debug("ZoteroAIAssistant: Error stack: " + error.stack);
    }
  },
  
  /**
   * Render sidebar content (synchronous)
   */
  renderSidebarContent(body, item) {
    if (ZoteroAIAssistant.Sidebar?.init) {
      ZoteroAIAssistant.Sidebar.init(body, item);
      return;
    }

    const doc = body.ownerDocument;
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    
    // Helper to create XHTML elements
    const h = (tag, attrs = {}, children = []) => {
      const el = doc.createElementNS(XHTML_NS, tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === "className") {
          el.className = value;
        } else if (key === "textContent") {
          el.textContent = value;
        } else {
          el.setAttribute(key, value);
        }
      }
      for (const child of children) {
        if (typeof child === "string") {
          el.appendChild(doc.createTextNode(child));
        } else if (child) {
          el.appendChild(child);
        }
      }
      return el;
    };
    
    // Clear body
    while (body.firstChild) {
      body.removeChild(body.firstChild);
    }
    
    if (!item) {
      body.appendChild(h("div", { className: "zai-empty", textContent: "Select a paper to start" }));
      return;
    }
    
    // Get current preferences
    const provider = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultProvider", true) || "copilot";
    const modelId = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "claude-sonnet-4.5";
    
    // Build the UI using DOM methods
    const container = h("div", { className: "zai-chat-container" }, [
      // Auth status - will be updated by updateAuthStatus
      h("div", { className: "zai-auth-status zai-auth-required", id: "zai-auth-status", style: "display: none;" }, [
        h("span", { className: "zai-status-text" }, [
          h("span", { className: "zai-status-icon", textContent: "🔗" }),
          h("span", { id: "zai-status-label", textContent: "Connect to use AI" })
        ]),
        h("button", { className: "zai-auth-btn", id: "zai-auth-btn", textContent: "Connect" })
      ]),
      
      // Provider selector
      h("div", { className: "zai-provider-selector" }, [
        // Provider is always Copilot now
        h("span", { className: "zai-provider-label", textContent: "GitHub Copilot" }),
        this.createModelSelect(doc, provider, modelId)
      ]),
      
      // Messages area
      h("div", { className: "zai-messages", id: "zai-messages" }, [
        h("div", { className: "zai-welcome" }, [
          h("div", { className: "zai-welcome-text", textContent: "Ask me anything about this paper!" })
        ])
      ]),
      
      // Quick actions
      h("div", { className: "zai-quick-actions", id: "zai-quick-actions" }, [
        h("button", { className: "zai-action-btn", "data-action": "summarize", textContent: "Summarize" }),
        h("button", { className: "zai-action-btn", "data-action": "keypoints", textContent: "Key Points" }),
        h("button", { className: "zai-action-btn", "data-action": "methods", textContent: "Methods" }),
        h("button", { className: "zai-action-btn", "data-action": "findings", textContent: "Findings" })
      ]),
      
      // Input area
      h("div", { className: "zai-input-area" }, [
        h("textarea", { id: "zai-input", placeholder: "Ask about this paper...", rows: "1" }),
        h("button", { id: "zai-send-btn", title: "Send message", textContent: "Send" })
      ])
    ]);
    
    body.appendChild(container);
    
    // Bind events
    this.bindSidebarEvents(body, item);
    
    // Initialize auth status (async, don't await)
    this.updateAuthStatus(body);
  },
  
  /**
   * Create a select element
   */
  createSelect(doc, id, options) {
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const select = doc.createElementNS(XHTML_NS, "select");
    select.id = id;
    
    for (const opt of options) {
      const option = doc.createElementNS(XHTML_NS, "option");
      option.value = opt.value;
      option.textContent = opt.text;
      if (opt.selected) option.selected = true;
      select.appendChild(option);
    }
    
    return select;
  },
  
  /**
   * Create the model select element
   */
  createModelSelect(doc, provider, selectedModelId) {
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const select = doc.createElementNS(XHTML_NS, "select");
    select.id = "zai-model-select";
    
    // Default option if ModelRegistry not loaded
    if (!ZoteroAIAssistant.ModelRegistry) {
      const option = doc.createElementNS(XHTML_NS, "option");
      option.value = "claude-sonnet-4.5";
      option.textContent = "Claude Sonnet 4.5";
      option.selected = true;
      select.appendChild(option);
      return select;
    }
    
    const models = ZoteroAIAssistant.ModelRegistry.getModels(provider);
    
    if (provider === "copilot" && ZoteroAIAssistant.ModelRegistry.getCopilotModelsByProvider) {
      const grouped = ZoteroAIAssistant.ModelRegistry.getCopilotModelsByProvider();
      
      for (const [providerKey, providerModels] of Object.entries(grouped)) {
        const optgroup = doc.createElementNS(XHTML_NS, "optgroup");
        optgroup.label = ZoteroAIAssistant.ModelRegistry.getProviderName(providerKey);
        
        for (const model of providerModels) {
          const option = doc.createElementNS(XHTML_NS, "option");
          option.value = model.id;
          option.textContent = model.name;
          if (model.id === selectedModelId) option.selected = true;
          optgroup.appendChild(option);
        }
        
        select.appendChild(optgroup);
      }
    } else {
      for (const model of models) {
        const option = doc.createElementNS(XHTML_NS, "option");
        option.value = model.id;
        option.textContent = model.name;
        if (model.id === selectedModelId) option.selected = true;
        select.appendChild(option);
      }
    }
    
    return select;
  },
  

  
  /**
   * Bind sidebar event handlers
   */
  bindSidebarEvents(container, item) {
    const doc = container.ownerDocument;
    
    // Auth button
    const authBtn = container.querySelector("#zai-auth-btn");
    authBtn?.addEventListener("click", () => {
      this.openAuthDialog(container.querySelector("#zai-provider-select")?.value || "copilot");
    });
    
    // Provider select
    const providerSelect = container.querySelector("#zai-provider-select");
    const modelSelect = container.querySelector("#zai-model-select");
    
    providerSelect?.addEventListener("change", (e) => {
      const provider = e.target.value;
      Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultProvider", provider, true);
      
      // Update model list
      if (ZoteroAIAssistant.ModelRegistry && modelSelect) {
        const defaultModel = ZoteroAIAssistant.ModelRegistry.getDefaultModel(provider);
        // Clear and rebuild model select
        while (modelSelect.firstChild) {
          modelSelect.removeChild(modelSelect.firstChild);
        }
        const newSelect = this.createModelSelect(doc, provider, defaultModel.id);
        while (newSelect.firstChild) {
          modelSelect.appendChild(newSelect.firstChild);
        }
        Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultModel", defaultModel.id, true);
      }
      
      // Update auth status
      this.updateAuthStatus(container);
    });
    
    // Model select
    modelSelect?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultModel", e.target.value, true);
    });
    
    // Quick action buttons
    const quickActions = container.querySelector("#zai-quick-actions");
    quickActions?.addEventListener("click", (e) => {
      const btn = e.target.closest(".zai-action-btn");
      if (btn) {
        this.handleQuickAction(container, item, btn.dataset.action);
      }
    });
    
    // Send button and input
    const sendBtn = container.querySelector("#zai-send-btn");
    const input = container.querySelector("#zai-input");
    
    sendBtn?.addEventListener("click", () => {
      this.sendMessage(container, item);
    });
    
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage(container, item);
      }
    });
    
    // Auto-resize textarea
    input?.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
    });
  },
  
  /**
   * Update auth status display
   */
  async updateAuthStatus(container) {
    const authStatus = container.querySelector("#zai-auth-status");
    const statusLabel = container.querySelector("#zai-status-label");
    const statusIcon = authStatus?.querySelector(".zai-status-icon");
    const authBtn = authStatus?.querySelector("#zai-auth-btn");
    
    if (!authStatus) return;
    
    const provider = container.querySelector("#zai-provider-select")?.value || "copilot";
    
    try {
      let isAuthenticated = false;
      let userName = null;
      
      if (provider === "copilot" && ZoteroAIAssistant.GitHubDeviceFlow) {
        isAuthenticated = await ZoteroAIAssistant.GitHubDeviceFlow.hasValidSession();
        if (isAuthenticated && ZoteroAIAssistant.TokenStorage) {
          const tokenData = await ZoteroAIAssistant.TokenStorage.getToken(
            ZoteroAIAssistant.TokenStorage.REALMS.GITHUB_COPILOT
          );
          userName = tokenData?.metadata?.user?.login;
        }
      }
      
      if (isAuthenticated) {
        // Show connected status
        authStatus.style.display = "flex";
        authStatus.className = "zai-auth-status zai-auth-connected";
        if (statusIcon) statusIcon.textContent = "";
        if (statusLabel) {
          statusLabel.textContent = userName 
            ? `Connected as ${userName}` 
            : "Connected";
        }
        if (authBtn) {
          authBtn.textContent = "Disconnect";
          authBtn.className = "zai-auth-btn zai-disconnect-btn";
          // Remove old event listeners and add disconnect handler
          const newBtn = authBtn.cloneNode(true);
          authBtn.parentNode.replaceChild(newBtn, authBtn);
          newBtn.addEventListener("click", () => this.handleDisconnect(container, provider));
        }
      } else {
        // Show connect prompt
        authStatus.style.display = "flex";
        authStatus.className = "zai-auth-status zai-auth-required";
        if (statusIcon) statusIcon.textContent = "🔗";
        if (statusLabel) {
          statusLabel.textContent = "Connect to GitHub Copilot";
        }
        if (authBtn) {
          authBtn.textContent = "Connect";
          authBtn.className = "zai-auth-btn";
          // Remove old event listeners and add connect handler
          const newBtn = authBtn.cloneNode(true);
          authBtn.parentNode.replaceChild(newBtn, authBtn);
          newBtn.addEventListener("click", () => this.openAuthDialog(provider));
        }
      }
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant: Error checking auth: " + error);
      authStatus.style.display = "flex";
      authStatus.className = "zai-auth-status zai-auth-required";
      if (statusIcon) statusIcon.textContent = "⚠";
      if (statusLabel) statusLabel.textContent = "Not connected";
      if (authBtn) {
        authBtn.textContent = "Connect";
        authBtn.className = "zai-auth-btn";
      }
    }
  },
  
  /**
   * Handle disconnect from provider
   */
  async handleDisconnect(container, provider) {
    try {
      if (ZoteroAIAssistant.GitHubDeviceFlow) {
        await ZoteroAIAssistant.GitHubDeviceFlow.disconnect();
      }
      
      // Update auth status display
      await this.updateAuthStatus(container);
      
      Zotero.debug("ZoteroAIAssistant: Disconnected from " + provider);
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant: Error disconnecting: " + error);
    }
  },
  
  /**
   * Open authentication dialog
   */
  openAuthDialog(provider) {
    const dialogURL = this.getChromeContentURL("ui/authDialog.xhtml");
    const parentWindow = Services.wm.getMostRecentWindow("navigator:browser");
    
    Services.ww.openWindow(
      parentWindow || null,
      dialogURL,
      "ZoteroAIAssistantAuth",
      "chrome,dialog,centerscreen,width=400,height=350",
      { provider, rootURI: this.rootURI }
    );
  },

  /**
   * Resolve a chrome/content-relative URL under the add-on root.
   */
  getChromeContentURL(relativePath) {
    const relPath = relativePath.replace(/^\/+/, "");
    return `chrome://zotero-ai-assistant/content/${relPath}`;
  },
  
  /**
   * Handle quick action buttons
   */
  async handleQuickAction(container, item, action) {
    const prompts = {
      summarize: "Please provide a concise summary of this paper, including the main objective, methodology, and key conclusions.",
      keypoints: "What are the key points and main takeaways from this paper? Please list them in order of importance.",
      methods: "Explain the methodology used in this paper. What approaches, techniques, or experiments were conducted?",
      findings: "What are the main findings and results of this paper? Include any significant data or statistics."
    };
    
    const prompt = prompts[action];
    if (prompt) {
      const input = container.querySelector("#zai-input");
      if (input) {
        input.value = prompt;
        await this.sendMessage(container, item);
      }
    }
  },
  
  /**
   * Send a message
   */
  async sendMessage(container, item) {
    const input = container.querySelector("#zai-input");
    const messagesEl = container.querySelector("#zai-messages");
    const content = input?.value?.trim();
    
    if (!content) return;
    
    // Check auth first
    const provider = container.querySelector("#zai-provider-select")?.value || "copilot";
    let isAuthenticated = false;
    
    try {
      if (ZoteroAIAssistant.GitHubDeviceFlow) {
        isAuthenticated = await ZoteroAIAssistant.GitHubDeviceFlow.hasValidSession();
      }
    } catch (e) {}
    
    if (!isAuthenticated) {
      this.openAuthDialog(provider);
      return;
    }
    
    // Clear input
    input.value = "";
    input.style.height = "auto";
    
    // Clear welcome message
    const welcome = messagesEl?.querySelector(".zai-welcome");
    if (welcome) welcome.remove();
    
    // Add user message
    this.appendMessage(messagesEl, "user", content);
    
    // Add assistant placeholder
    const assistantMsg = this.appendMessage(messagesEl, "assistant", "");
    const contentEl = assistantMsg.querySelector(".zai-message-content");
    contentEl.innerHTML = '<span class="zai-typing">Thinking...</span>';
    
    try {
      // Send to AI
      if (ZoteroAIAssistant.ChatManager) {
        ZoteroAIAssistant.ChatManager.setCurrentItem(item);
        
        let fullResponse = "";
        const result = await ZoteroAIAssistant.ChatManager.sendMessage(content, {
          item,
          onChunk: (chunk) => {
            fullResponse += chunk;
            contentEl.innerHTML = this.renderMarkdown(fullResponse);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          }
        });
        
        if (result.success) {
          contentEl.innerHTML = this.renderMarkdown(result.content);
        } else {
          contentEl.innerHTML = `<span class="zai-error">Error: ${result.error}</span>`;
        }
      } else {
        contentEl.innerHTML = '<span class="zai-error">Chat module not loaded</span>';
      }
    } catch (error) {
      contentEl.innerHTML = `<span class="zai-error">Error: ${error.message}</span>`;
    }
    
    messagesEl.scrollTop = messagesEl.scrollHeight;
  },
  
  /**
   * Append a message to the chat
   */
  appendMessage(container, role, content) {
    const msgEl = container.ownerDocument.createElement("div");
    msgEl.className = `zai-message zai-message-${role}`;
    
    const contentEl = container.ownerDocument.createElement("div");
    contentEl.className = "zai-message-content";
    contentEl.innerHTML = role === "assistant" ? this.renderMarkdown(content) : this.escapeHtml(content);
    
    msgEl.appendChild(contentEl);
    container.appendChild(msgEl);
    
    container.scrollTop = container.scrollHeight;
    return msgEl;
  },
  
  /**
   * Simple markdown rendering (XHTML compatible)
   */
  renderMarkdown(text) {
    if (!text) return "";
    
    let html = this.escapeHtml(text);
    
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Line breaks - use XHTML self-closing format
    html = html.replace(/\n/g, '<br/>');
    
    return html;
  },
  
  /**
   * Escape HTML
   */
  escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },
  
  /**
   * Async render sidebar content
   */
  async asyncRenderSidebarContent(body, item) {
    // This is called after onRender for additional async setup
    Zotero.debug("ZoteroAIAssistant: Async render for item: " + (item ? item.id : "none"));
    
    if (ZoteroAIAssistant.Sidebar?.setItem && ZoteroAIAssistant.Sidebar.container === body) {
      ZoteroAIAssistant.Sidebar.setItem(item);
      await ZoteroAIAssistant.Sidebar.loadAuthStatus();
      return;
    }

    // Update auth status display for legacy sidebar
    await this.updateAuthStatus(body);
  },
  
  /**
   * Add menu items to the window
   */
  addMenuItems(window) {
    const doc = window.document;
    
    // Expose ZoteroAIAssistant to the window so commands can access it
    window.ZoteroAIAssistant = this;
    
    // Add to Tools menu
    const toolsMenu = doc.getElementById("menu_ToolsPopup");
    if (toolsMenu) {
      const menuItem = doc.createXULElement("menuitem");
      menuItem.id = "zotero-ai-assistant-menu-item";
      menuItem.setAttribute("label", "AI Assistant");
      menuItem.addEventListener("command", () => {
        this.toggleAssistant();
      });
      toolsMenu.appendChild(menuItem);
      this.registeredMenuItems.push(menuItem);
    }
  },
  
  /**
   * Add keyboard shortcut to window
   */
  addKeyboardShortcut(window) {
    const doc = window.document;
    const self = this;
    
    // Create keyset if needed
    let keyset = doc.getElementById("zotero-ai-assistant-keyset");
    if (!keyset) {
      keyset = doc.createXULElement("keyset");
      keyset.id = "zotero-ai-assistant-keyset";
      doc.documentElement.appendChild(keyset);
    }
    
    // Get shortcuts from preferences
    const toggleKey = Zotero.Prefs.get("extensions.zotero-ai-assistant.shortcut.toggle", true) || "Z";
    const translateKey = Zotero.Prefs.get("extensions.zotero-ai-assistant.shortcut.translate", true) || "T";
    const explainKey = Zotero.Prefs.get("extensions.zotero-ai-assistant.shortcut.explain", true) || "E";
    const summarizeKey = Zotero.Prefs.get("extensions.zotero-ai-assistant.shortcut.summarize", true) || "S";
    
    // Define shortcuts with configurable keys
    const shortcuts = [
      {
        id: "zotero-ai-assistant-key",
        key: toggleKey,
        modifiers: "accel,shift",
        action: () => self.toggleAssistant()
      },
      {
        id: "zotero-ai-assistant-translate",
        key: translateKey,
        modifiers: "accel,shift",
        action: () => self.executeQuickAction("translate", window)
      },
      {
        id: "zotero-ai-assistant-explain",
        key: explainKey,
        modifiers: "accel,shift",
        action: () => self.executeQuickAction("explain", window)
      },
      {
        id: "zotero-ai-assistant-summarize",
        key: summarizeKey,
        modifiers: "accel,shift",
        action: () => self.executeQuickAction("summarize", window)
      }
    ];
    
    // Create keys
    for (const shortcut of shortcuts) {
      const key = doc.createXULElement("key");
      key.id = shortcut.id;
      key.setAttribute("key", shortcut.key);
      key.setAttribute("modifiers", shortcut.modifiers);
      key.addEventListener("command", shortcut.action);
      keyset.appendChild(key);
    }
    
    this.registeredShortcuts.push({ keyset });
  },
  
  /**
   * Execute a quick action from keyboard shortcut
   */
  executeQuickAction(action, window) {
    // Try to get selected text from PDF reader
    let selectedText = null;
    
    if (ZoteroAIAssistant.PDFReader) {
      selectedText = ZoteroAIAssistant.PDFReader.getSelectedText();
    }
    
    if (!selectedText) {
      // Try to get selected text from the window
      const selection = window.getSelection?.();
      if (selection) {
        selectedText = selection.toString().trim();
      }
    }
    
    if (!selectedText && (action === "translate" || action === "explain")) {
      // No text selected - show a message
      Zotero.debug("ZoteroAIAssistant: No text selected for " + action);
      return;
    }
    
    // Execute the action
    if (action === "translate" && selectedText) {
      const targetLang = Zotero.Prefs.get("extensions.zotero-ai-assistant.translateLanguage", true) || "zh";
      ZoteroAIAssistant.PaperActions?.translate(selectedText, targetLang);
    } else if (action === "explain" && selectedText) {
      ZoteroAIAssistant.PaperActions?.explain(selectedText);
    } else if (action === "summarize") {
      ZoteroAIAssistant.PaperActions?.summarize();
    }
    
    // Open the assistant to show the result
    this.toggleAssistant(true);
  },
  
  /**
   * Remove plugin UI from a specific window
   */
  removeFromWindow(window) {
    Zotero.debug("ZoteroAIAssistant: Removing from window");
    
    const doc = window.document;
    
    // Remove stylesheet
    doc.getElementById("zotero-ai-assistant-styles")?.remove();
    
    // Remove FTL
    doc.querySelector('[href="zotero-ai-assistant.ftl"]')?.remove();
    
    // Remove menu items
    for (const item of this.registeredMenuItems) {
      item.remove();
    }
    this.registeredMenuItems = [];
    
    // Remove keyboard shortcuts
    for (const { keyset } of this.registeredShortcuts) {
      keyset.remove();
    }
    this.registeredShortcuts = [];
    
    // Remove window reference
    delete window.ZoteroAIAssistant;
  },
  
  /**
   * Remove plugin UI from all windows
   */
  removeFromAllWindows() {
    const windows = Zotero.getMainWindows();
    for (const win of windows) {
      if (!win.ZoteroPane) continue;
      this.removeFromWindow(win);
    }
    
    // Unregister sidebar section
    if (this.registeredSectionID) {
      Zotero.ItemPaneManager.unregisterSection(this.registeredSectionID);
      this.registeredSectionID = null;
    }
  },
  
  // Store selected text for use in chat
  pendingSelectedText: null,
  
  /**
   * Set selected text to be used in the next chat
   */
  setSelectedText(text) {
    this.pendingSelectedText = text;
  },
  
  /**
   * Get and clear pending selected text
   */
  getPendingSelectedText() {
    const text = this.pendingSelectedText;
    this.pendingSelectedText = null;
    return text;
  },
  
  /**
   * Toggle the AI Assistant (sidebar or floating window)
   * @param {boolean} forceShow - If true, always show (don't toggle off)
   */
  toggleAssistant(forceShow = false) {
    const uiMode = Zotero.Prefs.get("extensions.zotero-ai-assistant.uiMode", true);
    
    if (uiMode === "floating") {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.uiMode", "sidebar", true);
    }
    this.toggleSidebar();
  },
  
  /**
   * Toggle the sidebar section
   */
  toggleSidebar() {
    // Implementation depends on Zotero's API for toggling sections
    Zotero.debug("ZoteroAIAssistant: Toggle sidebar");
  },
  
  /**
   * Toggle the floating window
   */
  toggleFloatingWindow() {
    this.toggleSidebar();
  },
  
  /**
   * Open the floating window
   */
  openFloatingWindow() {
    Zotero.debug("ZoteroAIAssistant: Floating window disabled; using sidebar.");
    this.toggleSidebar();
  },
  
  /**
   * Open the preferences pane
   */
  openPreferences() {
    Zotero.Utilities.Internal.openPreferences("zotero-ai-assistant");
  },
  
  /**
   * Shutdown the plugin
   */
  shutdown() {
    Zotero.debug("ZoteroAIAssistant: Shutdown");
    
    // Close floating window if open
    if (this.floatingWindow && !this.floatingWindow.closed) {
      this.floatingWindow.close();
    }
    
    this.initialized = false;
  }
};
