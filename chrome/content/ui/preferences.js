/**
 * Preferences Panel Controller
 * 
 * Manages the AI Assistant preferences/settings panel in Zotero's preferences dialog.
 */

var ZoteroAIAssistantPrefs = {
  // Reference to main ZoteroAIAssistant module
  ZAI: null,

  TASK_MODEL_CONFIG: [
    { id: "summarize", label: "Summarize" },
    { id: "keypoints", label: "Key Points" },
    { id: "methods", label: "Methods" },
    { id: "findings", label: "Findings" },
    { id: "compare", label: "Compare" }
  ],
  
  /**
   * Initialize preferences panel
   */
  async init() {
    try {
      Zotero.debug("ZoteroAIAssistantPrefs: Initializing");
      
      // Load modules from main window
      this.loadModules();
      
      if (!this.ZAI) {
        Zotero.debug("ZoteroAIAssistantPrefs: WARNING - Could not load ZoteroAIAssistant modules");
      }
      
      // Load current preferences
      this.loadPreferences();
      
      // Load account status
      await this.updateCopilotStatus();
      
      // Bind events
      this.bindEvents();
      
      Zotero.debug("ZoteroAIAssistantPrefs: Initialization complete");
    } catch (error) {
      Zotero.debug("ZoteroAIAssistantPrefs: Init error - " + error);
    }
  },
  
  /**
   * Load modules from main Zotero window
   */
  loadModules() {
    try {
      // Try to get ZoteroAIAssistant from various sources
      if (typeof ZoteroAIAssistant !== "undefined" && ZoteroAIAssistant) {
        this.ZAI = ZoteroAIAssistant;
        Zotero.debug("ZoteroAIAssistantPrefs: Found ZoteroAIAssistant in current scope");
        return;
      }
      
      // Try main window
      const mainWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (mainWindow && mainWindow.ZoteroAIAssistant) {
        this.ZAI = mainWindow.ZoteroAIAssistant;
        window.ZoteroAIAssistant = mainWindow.ZoteroAIAssistant;
        Zotero.debug("ZoteroAIAssistantPrefs: Found ZoteroAIAssistant in main window");
        return;
      }
      
      // Try all Zotero windows
      const windows = Services.wm.getEnumerator("navigator:browser");
      while (windows.hasMoreElements()) {
        const win = windows.getNext();
        if (win.ZoteroAIAssistant) {
          this.ZAI = win.ZoteroAIAssistant;
          window.ZoteroAIAssistant = win.ZoteroAIAssistant;
          Zotero.debug("ZoteroAIAssistantPrefs: Found ZoteroAIAssistant in another window");
          return;
        }
      }
      
      Zotero.debug("ZoteroAIAssistantPrefs: Could not find ZoteroAIAssistant in any window");
    } catch (error) {
      Zotero.debug("ZoteroAIAssistantPrefs: Error loading modules - " + error);
    }
  },
  
  /**
   * Load saved preferences into form fields
   */
  loadPreferences() {
    try {
      // Update model list (Copilot only)
      this.updateModelOptions();
      
      // UI mode
      const uiMode = Zotero.Prefs.get("extensions.zotero-ai-assistant.uiMode", true) || "sidebar";
      const uiModeEl = document.getElementById("zai-ui-mode");
      if (uiModeEl) uiModeEl.value = uiMode;
      
      // Window dimensions
      const width = Zotero.Prefs.get("extensions.zotero-ai-assistant.floatingWindowWidth", true) || 420;
      const height = Zotero.Prefs.get("extensions.zotero-ai-assistant.floatingWindowHeight", true) || 650;
      const widthEl = document.getElementById("zai-window-width");
      const heightEl = document.getElementById("zai-window-height");
      if (widthEl) widthEl.value = width;
      if (heightEl) heightEl.value = height;
      
      // Custom system prompt
      const customPrompt = Zotero.Prefs.get("extensions.zotero-ai-assistant.customSystemPrompt", true) || "";
      const promptEl = document.getElementById("zai-system-prompt");
      if (promptEl) promptEl.value = customPrompt;
      
      // Save history
      const saveHistory = Zotero.Prefs.get("extensions.zotero-ai-assistant.saveConversationHistory", true);
      const historyEl = document.getElementById("zai-save-history");
      if (historyEl) historyEl.checked = saveHistory !== false;
      
      // Translation language
      const translateLang = Zotero.Prefs.get("extensions.zotero-ai-assistant.translateLanguage", true) || "zh";
      const translateEl = document.getElementById("zai-translate-language");
      if (translateEl) translateEl.value = translateLang;
      
      // Temperature
      const temperature = Zotero.Prefs.get("extensions.zotero-ai-assistant.temperature", true) || 0.3;
      const tempEl = document.getElementById("zai-temperature");
      const tempValueEl = document.getElementById("zai-temperature-value");
      if (tempEl) tempEl.value = Math.round(temperature * 100);
      if (tempValueEl) tempValueEl.textContent = temperature.toFixed(1);
      
      // Max tokens
      const maxTokens = Zotero.Prefs.get("extensions.zotero-ai-assistant.maxTokens", true) || 2000;
      const maxTokensEl = document.getElementById("zai-max-tokens");
      if (maxTokensEl) maxTokensEl.value = maxTokens;
      
      // Local model endpoints
      const ollamaEndpoint = Zotero.Prefs.get("extensions.zotero-ai-assistant.ollamaEndpoint", true) || "http://localhost:11434";
      const ollamaEl = document.getElementById("zai-ollama-endpoint");
      if (ollamaEl) ollamaEl.value = ollamaEndpoint;
      
      const lmstudioEndpoint = Zotero.Prefs.get("extensions.zotero-ai-assistant.lmstudioEndpoint", true) || "http://localhost:1234";
      const lmstudioEl = document.getElementById("zai-lmstudio-endpoint");
      if (lmstudioEl) lmstudioEl.value = lmstudioEndpoint;
      
      // Keyboard shortcuts
      const shortcuts = ["toggle", "translate", "explain", "summarize"];
      const defaults = { toggle: "Z", translate: "T", explain: "E", summarize: "S" };
      for (const action of shortcuts) {
        const key = Zotero.Prefs.get(`extensions.zotero-ai-assistant.shortcut.${action}`, true) || defaults[action];
        const el = document.getElementById(`zai-shortcut-${action}`);
        if (el) el.value = key.toUpperCase();
      }
      
      Zotero.debug("ZoteroAIAssistantPrefs: Preferences loaded");
    } catch (error) {
      Zotero.debug("ZoteroAIAssistantPrefs: Error loading preferences - " + error);
    }
  },
  
  /**
   * Update model dropdown options (default + task overrides)
   */
  updateModelOptions() {
    const providerSelect = document.getElementById("zai-default-provider");
    const currentProvider = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultProvider", true) || "copilot";
    
    if (providerSelect) {
      providerSelect.value = currentProvider;
    }
    
    const entries = this.getModelSelectEntries();
    if (!entries.length) return;
    
    if (currentProvider === "ollama" || currentProvider === "lmstudio") {
      this.loadLocalModelsForPrefs(currentProvider, entries);
    } else {
      this.loadCopilotModelsForPrefs(entries);
    }
  },
  
  getModelSelectEntries() {
    const entries = [];
    const defaultSelect = document.getElementById("zai-default-model");
    if (defaultSelect) {
      entries.push({
        selectEl: defaultSelect,
        prefKey: "extensions.zotero-ai-assistant.defaultModel",
        currentModel: Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true),
        includeDefaultOption: false
      });
    }
    
    for (const task of this.TASK_MODEL_CONFIG) {
      const selectEl = document.getElementById(`zai-task-model-${task.id}`);
      if (!selectEl) continue;
      entries.push({
        selectEl,
        prefKey: `extensions.zotero-ai-assistant.taskModel.${task.id}`,
        currentModel: Zotero.Prefs.get(`extensions.zotero-ai-assistant.taskModel.${task.id}`, true),
        includeDefaultOption: true
      });
    }
    
    return entries;
  },
  
  clearSelect(selectEl) {
    while (selectEl.firstChild) {
      selectEl.removeChild(selectEl.firstChild);
    }
  },
  
  appendOption(selectEl, { value = "", label = "", disabled = false, selected = false } = {}) {
    const doc = selectEl.ownerDocument || document;
    const option = doc.createElementNS("http://www.w3.org/1999/xhtml", "option");
    option.value = value;
    option.textContent = label;
    option.disabled = !!disabled;
    if (selected) {
      option.selected = true;
    }
    selectEl.appendChild(option);
  },
  
  getCopilotModelGroups() {
    const providerOrder = ["xai", "anthropic", "google", "openai", "other"];
    const groups = [];
    let defaultModelId = null;
    
    if (this.ZAI?.ModelRegistry) {
      defaultModelId = this.ZAI.ModelRegistry.getDefaultModel?.("copilot")?.id || null;
      if (this.ZAI.ModelRegistry.getCopilotModelsByProvider) {
        const grouped = this.ZAI.ModelRegistry.getCopilotModelsByProvider();
        for (const providerKey of providerOrder) {
          const providerModels = grouped[providerKey];
          if (!providerModels || providerModels.length === 0) continue;
          const providerName = this.ZAI.ModelRegistry.getProviderName(providerKey);
          groups.push({
            label: providerName,
            models: providerModels.map(model => ({ id: model.id, name: model.name }))
          });
        }
      } else if (this.ZAI.ModelRegistry.getModels) {
        const models = this.ZAI.ModelRegistry.getModels("copilot");
        if (models && models.length) {
          groups.push({
            label: null,
            models: models.map(model => ({ id: model.id, name: model.name }))
          });
        }
      }
    }
    
    if (groups.length === 0) {
      groups.push(
        { label: "xAI", models: [{ id: "grok-code-fast-1", name: "Grok Code Fast 1" }] },
        { label: "Anthropic", models: [{ id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5" }, { id: "claude-sonnet-4", name: "Claude Sonnet 4" }] },
        { label: "OpenAI", models: [{ id: "gpt-4.1", name: "GPT-4.1" }] },
        { label: "Google", models: [{ id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" }] }
      );
      defaultModelId = "grok-code-fast-1";
    }
    
    const modelIds = new Set();
    for (const group of groups) {
      for (const model of group.models) {
        modelIds.add(model.id);
      }
    }
    
    return { groups, modelIds, defaultModelId };
  },
  
  loadCopilotModelsForPrefs(entries) {
    const { groups, modelIds, defaultModelId } = this.getCopilotModelGroups();
    
    for (const entry of entries) {
      const selectEl = entry.selectEl;
      this.clearSelect(selectEl);
      
      if (entry.includeDefaultOption) {
        this.appendOption(selectEl, { value: "", label: "Use Default Model" });
      }
      
      let selected = false;
      
      for (const group of groups) {
        if (group.label) {
          this.appendOption(selectEl, { value: "", label: `[${group.label}]`, disabled: true });
        }
        for (const model of group.models) {
          const isSelected = entry.currentModel && model.id === entry.currentModel;
          this.appendOption(selectEl, {
            value: model.id,
            label: group.label ? `  ${model.name}` : model.name,
            selected: isSelected
          });
          if (isSelected) {
            selected = true;
          }
        }
      }
      
      if (!selected) {
        if (entry.includeDefaultOption) {
          selectEl.value = "";
          if (entry.prefKey) {
            Zotero.Prefs.set(entry.prefKey, "", true);
          }
        } else {
          const fallback = entry.currentModel && modelIds.has(entry.currentModel)
            ? entry.currentModel
            : (defaultModelId || Array.from(modelIds)[0]);
          if (fallback) {
            selectEl.value = fallback;
            if (entry.prefKey) {
              Zotero.Prefs.set(entry.prefKey, fallback, true);
            }
          }
        }
      }
    }
  },
  
  async loadLocalModelsForPrefs(provider, entries) {
    const providerName = provider === "ollama" ? "Ollama" : "LM Studio";
    
    for (const entry of entries) {
      this.clearSelect(entry.selectEl);
      if (entry.includeDefaultOption) {
        this.appendOption(entry.selectEl, { value: "", label: "Use Default Model" });
      }
      this.appendOption(entry.selectEl, { value: "", label: "Loading models...", disabled: true });
    }
    
    if (!this.ZAI || !this.ZAI.LocalModelClient) {
      for (const entry of entries) {
        this.clearSelect(entry.selectEl);
        if (entry.includeDefaultOption) {
          this.appendOption(entry.selectEl, { value: "", label: "Use Default Model" });
        }
        this.appendOption(entry.selectEl, { value: "", label: "LocalModelClient not available", disabled: true });
      }
      return;
    }
    
    try {
      const result = await this.ZAI.LocalModelClient.checkConnection(provider);
      const models = result.connected ? result.models || [] : [];
      const modelIds = new Set(models.map(model => model.id));
      
      for (const entry of entries) {
        const selectEl = entry.selectEl;
        this.clearSelect(selectEl);
        if (entry.includeDefaultOption) {
          this.appendOption(selectEl, { value: "", label: "Use Default Model" });
        }
        
        if (!result.connected || models.length === 0) {
          const message = result.connected
            ? `No models found - start ${providerName} server`
            : `Unable to reach ${providerName} server`;
          this.appendOption(selectEl, { value: "", label: message, disabled: true });
          if (entry.includeDefaultOption && entry.prefKey) {
            Zotero.Prefs.set(entry.prefKey, "", true);
          }
          continue;
        }
        
        let selected = false;
        for (const model of models) {
          const isSelected = entry.currentModel && model.id === entry.currentModel;
          this.appendOption(selectEl, {
            value: model.id,
            label: model.name,
            selected: isSelected
          });
          if (isSelected) {
            selected = true;
          }
        }
        
        if (!selected) {
          if (entry.includeDefaultOption) {
            selectEl.value = "";
            if (entry.prefKey) {
              Zotero.Prefs.set(entry.prefKey, "", true);
            }
          } else if (models.length) {
            selectEl.value = models[0].id;
            if (entry.prefKey) {
              Zotero.Prefs.set(entry.prefKey, models[0].id, true);
            }
          }
        }
      }
    } catch (e) {
      Zotero.debug("Error loading local models: " + e);
      for (const entry of entries) {
        this.clearSelect(entry.selectEl);
        if (entry.includeDefaultOption) {
          this.appendOption(entry.selectEl, { value: "", label: "Use Default Model" });
        }
        this.appendOption(entry.selectEl, { value: "", label: "Error loading models", disabled: true });
      }
    }
  },
  
  /**
   * Update GitHub Copilot connection status
   */
  async updateCopilotStatus() {
    const statusContainer = document.getElementById("zai-copilot-status");
    const userEl = document.getElementById("zai-copilot-user");
    const connectBtn = document.getElementById("zai-copilot-connect-btn");
    const disconnectBtn = document.getElementById("zai-copilot-disconnect-btn");
    
    if (!statusContainer || !connectBtn || !disconnectBtn) return;
    
    try {
      if (!this.ZAI || !this.ZAI.GitHubDeviceFlow) {
        Zotero.debug("ZoteroAIAssistantPrefs: GitHubDeviceFlow not available");
        statusContainer.innerHTML = '<span class="zai-status-badge zai-status-disconnected">Not connected</span>';
        return;
      }
      
      const isConnected = await this.ZAI.GitHubDeviceFlow.hasValidSession();
      
      if (isConnected) {
        // Get user info from stored token
        let userName = null;
        if (this.ZAI.TokenStorage) {
          const tokenData = await this.ZAI.TokenStorage.getToken(
            this.ZAI.TokenStorage.REALMS.GITHUB_COPILOT
          );
          userName = tokenData?.metadata?.user?.login;
        }
        
        statusContainer.innerHTML = '<span class="zai-status-badge zai-status-connected">Connected</span>';
        
        if (userName && userEl) {
          userEl.textContent = `@${userName}`;
          userEl.style.display = "inline";
        }
        
        connectBtn.style.display = "none";
        disconnectBtn.style.display = "inline-block";
      } else {
        statusContainer.innerHTML = '<span class="zai-status-badge zai-status-disconnected">Not connected</span>';
        if (userEl) userEl.style.display = "none";
        connectBtn.style.display = "inline-block";
        disconnectBtn.style.display = "none";
      }
    } catch (error) {
      Zotero.debug("ZoteroAIAssistantPrefs: Error checking Copilot status - " + error);
      statusContainer.innerHTML = '<span class="zai-status-badge zai-status-disconnected">Not connected</span>';
      if (userEl) userEl.style.display = "none";
      connectBtn.style.display = "inline-block";
      disconnectBtn.style.display = "none";
    }
  },
  
  /**
   * Bind event listeners
   */
  bindEvents() {
    // Provider change
    document.getElementById("zai-default-provider")?.addEventListener("change", (e) => {
      const provider = e.target.value;
      Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultProvider", provider, true);
      this.updateModelOptions();
    });
    
    // Model change
    document.getElementById("zai-default-model")?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultModel", e.target.value, true);
    });

    // Task model changes
    for (const task of this.TASK_MODEL_CONFIG) {
      document.getElementById(`zai-task-model-${task.id}`)?.addEventListener("change", (e) => {
        Zotero.Prefs.set(`extensions.zotero-ai-assistant.taskModel.${task.id}`, e.target.value, true);
      });
    }
    
    // UI mode change
    document.getElementById("zai-ui-mode")?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.uiMode", e.target.value, true);
    });
    
    // Window width
    document.getElementById("zai-window-width")?.addEventListener("change", (e) => {
      const value = parseInt(e.target.value, 10);
      if (value >= 300 && value <= 800) {
        Zotero.Prefs.set("extensions.zotero-ai-assistant.floatingWindowWidth", value, true);
      }
    });
    
    // Window height
    document.getElementById("zai-window-height")?.addEventListener("change", (e) => {
      const value = parseInt(e.target.value, 10);
      if (value >= 400 && value <= 1000) {
        Zotero.Prefs.set("extensions.zotero-ai-assistant.floatingWindowHeight", value, true);
      }
    });
    
    // Custom system prompt
    document.getElementById("zai-system-prompt")?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.customSystemPrompt", e.target.value, true);
    });
    
    // Save history
    document.getElementById("zai-save-history")?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.saveConversationHistory", e.target.checked, true);
    });
    
    // Translation language
    document.getElementById("zai-translate-language")?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.translateLanguage", e.target.value, true);
    });
    
    // Temperature slider
    document.getElementById("zai-temperature")?.addEventListener("input", (e) => {
      const value = parseInt(e.target.value, 10) / 100;
      const valueEl = document.getElementById("zai-temperature-value");
      if (valueEl) valueEl.textContent = value.toFixed(1);
      Zotero.Prefs.set("extensions.zotero-ai-assistant.temperature", value, true);
    });
    
    // Max tokens
    document.getElementById("zai-max-tokens")?.addEventListener("change", (e) => {
      const value = parseInt(e.target.value, 10);
      Zotero.Prefs.set("extensions.zotero-ai-assistant.maxTokens", value, true);
    });
    
    // Ollama endpoint
    document.getElementById("zai-ollama-endpoint")?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.ollamaEndpoint", e.target.value, true);
    });
    
    // LM Studio endpoint
    document.getElementById("zai-lmstudio-endpoint")?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.lmstudioEndpoint", e.target.value, true);
    });
    
    // Test local connection
    document.getElementById("zai-test-local-btn")?.addEventListener("click", () => {
      this.testLocalConnection();
    });
    
    // Keyboard shortcuts
    const shortcuts = ["toggle", "translate", "explain", "summarize"];
    for (const action of shortcuts) {
      document.getElementById(`zai-shortcut-${action}`)?.addEventListener("change", (e) => {
        const key = e.target.value.toUpperCase().charAt(0) || "Z";
        e.target.value = key;
        Zotero.Prefs.set(`extensions.zotero-ai-assistant.shortcut.${action}`, key, true);
      });
    }
    
    // Connect Copilot
    document.getElementById("zai-copilot-connect-btn")?.addEventListener("click", () => {
      this.connectCopilot();
    });
    
    // Disconnect Copilot
    document.getElementById("zai-copilot-disconnect-btn")?.addEventListener("click", () => {
      this.disconnectCopilot();
    });
    
    // Clear conversations
    document.getElementById("zai-clear-conversations-btn")?.addEventListener("click", () => {
      this.clearConversations();
    });
    
    // GitHub repo link
    document.getElementById("zai-github-repo")?.addEventListener("click", (e) => {
      e.preventDefault();
      Zotero.launchURL("https://github.com/jiayingqi/ZoteroAIAssistant");
    });
  },
  
  /**
   * Connect to GitHub Copilot
   */
  async connectCopilot() {
    const connectBtn = document.getElementById("zai-copilot-connect-btn");
    const statusContainer = document.getElementById("zai-copilot-status");
    
    if (!connectBtn || !statusContainer) return;
    
    // Check if module is available
    if (!this.ZAI || !this.ZAI.GitHubDeviceFlow) {
      Services.prompt.alert(
        window,
        "Error",
        "GitHub Copilot module not loaded. Please restart Zotero and try again."
      );
      return;
    }
    
    // Update UI to show connecting
    connectBtn.textContent = "Connecting...";
    connectBtn.disabled = true;
    statusContainer.innerHTML = '<span class="zai-status-badge" style="background: #fef3c7; color: #92400e;">Connecting...</span>';
    
    try {
      Zotero.debug("ZoteroAIAssistantPrefs: Starting GitHub device flow");
      
      // Step 1: Get the device code first
      const { userCode, verificationUri } = await this.ZAI.GitHubDeviceFlow.startDeviceFlow();
      
      Zotero.debug("ZoteroAIAssistantPrefs: Got device code: " + userCode);
      
      // Step 2: Open the verification URL
      Zotero.launchURL(verificationUri);
      
      // Step 3: Show NON-BLOCKING dialog with the code (just for user info)
      // Use setTimeout to make it non-blocking
      setTimeout(() => {
        Services.prompt.alert(
          window,
          "GitHub Device Code",
          `Please enter this code on the GitHub page:\n\n${userCode}\n\nClick OK - authentication will complete automatically.`
        );
      }, 100);
      
      // Step 4: Start polling (this runs independently)
      statusContainer.innerHTML = '<span class="zai-status-badge" style="background: #fef3c7; color: #92400e;">Waiting for authorization...</span>';
      
      const accessToken = await this.ZAI.GitHubDeviceFlow.pollForToken((status) => {
        Zotero.debug("ZoteroAIAssistantPrefs: Device flow status: " + status);
      });
      
      // Step 5: Get Copilot token
      statusContainer.innerHTML = '<span class="zai-status-badge" style="background: #fef3c7; color: #92400e;">Getting Copilot access...</span>';
      const copilotToken = await this.ZAI.GitHubDeviceFlow.getCopilotToken(accessToken);
      
      // Step 6: Get user info
      const user = await this.ZAI.GitHubDeviceFlow.getUserInfo(accessToken);
      
      // Step 7: Store tokens
      await this.ZAI.TokenStorage.storeToken(
        this.ZAI.TokenStorage.REALMS.GITHUB_COPILOT,
        accessToken,
        { user }
      );
      
      await this.ZAI.TokenStorage.storeToken(
        this.ZAI.TokenStorage.REALMS.GITHUB_COPILOT_SESSION,
        copilotToken.token,
        { expiresAt: copilotToken.expiresAt }
      );
      
      Zotero.debug("ZoteroAIAssistantPrefs: GitHub auth complete");
      
      // Show success with username
      const userName = user?.login || "Connected";
      statusContainer.innerHTML = '<span class="zai-status-badge zai-status-connected">Connected</span>';
      
      const userEl = document.getElementById("zai-copilot-user");
      if (userEl) {
        userEl.textContent = `@${userName}`;
        userEl.style.display = "inline";
      }
      
      connectBtn.style.display = "none";
      document.getElementById("zai-copilot-disconnect-btn").style.display = "inline-block";
      
    } catch (error) {
      Zotero.debug("ZoteroAIAssistantPrefs: GitHub auth failed: " + error);
      
      // Show error
      statusContainer.innerHTML = '<span class="zai-status-badge zai-status-disconnected">Connection failed</span>';
      
      // Show error message to user
      Services.prompt.alert(
        window,
        "Connection Failed",
        "Failed to connect to GitHub Copilot:\n\n" + error.message
      );
    } finally {
      connectBtn.textContent = "Connect";
      connectBtn.disabled = false;
      
      // Refresh status
      await this.updateCopilotStatus();
    }
  },
  
  /**
   * Disconnect GitHub Copilot
   */
  async disconnectCopilot() {
    if (!this.ZAI || !this.ZAI.GitHubDeviceFlow) return;
    
    const confirmed = Services.prompt.confirm(
      window,
      "Disconnect GitHub Copilot",
      "Are you sure you want to disconnect from GitHub Copilot?"
    );
    
    if (confirmed) {
      await this.ZAI.GitHubDeviceFlow.disconnect();
      await this.updateCopilotStatus();
    }
  },
  
  /**
   * Test local model connection
   */
  async testLocalConnection() {
    const statusEl = document.getElementById("zai-local-status");
    if (!statusEl) return;
    
    statusEl.textContent = "Testing...";
    statusEl.style.color = "#6b7280";
    
    let results = [];
    
    // Test Ollama
    if (this.ZAI?.LocalModelClient) {
      const ollamaResult = await this.ZAI.LocalModelClient.checkConnection("ollama");
      if (ollamaResult.connected) {
        results.push(`Ollama: ${ollamaResult.models?.length || 0} models found`);
      } else {
        results.push(`Ollama: Not running`);
      }
      
      const lmResult = await this.ZAI.LocalModelClient.checkConnection("lmstudio");
      if (lmResult.connected) {
        results.push(`LM Studio: ${lmResult.models?.length || 0} models found`);
      } else {
        results.push(`LM Studio: Not running`);
      }
    } else {
      results.push("Local model client not loaded");
    }
    
    statusEl.textContent = results.join(" | ");
    statusEl.style.color = "#10b981";
  },
  
  /**
   * Clear all conversation history
   */
  clearConversations() {
    const confirmed = Services.prompt.confirm(
      window,
      "Clear Conversations",
      "Are you sure you want to clear all conversation history? This cannot be undone."
    );
    
    if (confirmed) {
      // Clear the conversations map
      if (this.ZAI && this.ZAI.ChatManager) {
        this.ZAI.ChatManager.conversations.clear();
        this.ZAI.ChatManager.currentMessages = [];
      }
      
      Services.prompt.alert(window, "Success", "All conversations have been cleared.");
    }
  }
};

// Initialize when DOM is ready
(function() {
  function initPrefs() {
    if (typeof ZoteroAIAssistantPrefs !== "undefined") {
      try {
        ZoteroAIAssistantPrefs.init();
      } catch (error) {
        Zotero.debug("ZoteroAIAssistantPrefs: Auto-init error - " + error);
      }
    }
  }
  
  // Try to initialize after a brief delay to ensure DOM is ready
  if (typeof document !== "undefined" && document.readyState === "complete") {
    setTimeout(initPrefs, 50);
  } else if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initPrefs);
    if (typeof window !== "undefined") {
      window.addEventListener("load", initPrefs);
    }
  }
  
  setTimeout(initPrefs, 100);
})();
