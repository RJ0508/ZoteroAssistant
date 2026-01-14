/**
 * Floating Window Controller
 * 
 * Manages the standalone floating AI Assistant window.
 * Similar to sidebar but operates independently of Zotero's main window.
 */

var ZoteroAIAssistantFloating = {
  // DOM references
  messagesContainer: null,
  inputArea: null,
  sendButton: null,
  attachmentsContainer: null,
  attachButton: null,
  providerSelect: null,
  modelSelect: null,
  paperTitleEl: null,
  
  // State
  currentItem: null,
  isStreaming: false,
  abortController: null,
  isPinned: false,
  pendingImages: [],
  MAX_IMAGE_ATTACHMENTS: 4,
  MAX_IMAGE_BYTES: 2 * 1024 * 1024,
  MAX_IMAGE_DIMENSION: 1024,
  IMAGE_QUALITY: 0.85,
  
  /**
   * Initialize the floating window
   */
  async init() {
    Zotero.debug("ZoteroAIAssistantFloating: Initializing");
    
    // Load required modules
    await this.loadModules();
    
    // Cache DOM references
    this.messagesContainer = document.getElementById("zai-messages");
    this.inputArea = document.getElementById("zai-input");
    this.sendButton = document.getElementById("zai-send-btn");
    this.attachmentsContainer = document.getElementById("zai-attachments");
    this.attachButton = document.getElementById("zai-attach-btn");
    this.providerSelect = document.getElementById("zai-provider-select");
    this.modelSelect = document.getElementById("zai-model-select");
    this.paperTitleEl = document.getElementById("zai-paper-title");
    this.pendingImages = [];
    
    // Load preferences
    this.loadPreferences();
    
    // Bind events
    this.bindEvents();
    this.renderPendingImages();
    
    // Load auth status
    await this.loadAuthStatus();
    
    // Get current selected item from Zotero
    this.loadCurrentItem();
    
    // Listen for item selection changes
    this.setupItemListener();
  },
  
  /**
   * Load required modules from parent Zotero context
   */
  async loadModules() {
    // Access the main ZoteroAIAssistant from the opener or Zotero global
    if (typeof ZoteroAIAssistant === "undefined") {
      // Load from Zotero's global scope
      const mainWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (mainWindow && mainWindow.ZoteroAIAssistant) {
        window.ZoteroAIAssistant = mainWindow.ZoteroAIAssistant;
      }
    }
  },

  getPDFReader() {
    if (ZoteroAIAssistant?.PDFReader) {
      return ZoteroAIAssistant.PDFReader;
    }
    const mainWindow = Zotero.getMainWindow?.();
    return mainWindow?.ZoteroAIAssistant?.PDFReader || null;
  },
  
  /**
   * Load saved preferences
   */
  loadPreferences() {
    const provider = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultProvider", true) || "copilot";
    const modelId = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "grok-code-fast-1";
    
    this.providerSelect.value = provider;
    this.updateModelOptions(provider, modelId);
  },
  
  /**
   * Update model options dropdown
   */
  updateModelOptions(provider, selectedModelId) {
    const models = ZoteroAIAssistant.ModelRegistry.getModels(provider);
    
    let html = "";
    
    if (provider === "copilot") {
      const grouped = ZoteroAIAssistant.ModelRegistry.getCopilotModelsByProvider();
      
      for (const [providerKey, providerModels] of Object.entries(grouped)) {
        const providerName = ZoteroAIAssistant.ModelRegistry.getProviderName(providerKey);
        html += `<optgroup label="${providerName}">`;
        
        for (const model of providerModels) {
          const selected = model.id === selectedModelId ? "selected" : "";
          html += `<option value="${model.id}" ${selected}>${model.name}</option>`;
        }
        
        html += `</optgroup>`;
      }
    } else {
      for (const model of models) {
        const selected = model.id === selectedModelId ? "selected" : "";
        html += `<option value="${model.id}" ${selected}>${model.name}</option>`;
      }
    }
    
    this.modelSelect.innerHTML = html;
  },
  
  /**
   * Bind event listeners
   */
  bindEvents() {
    // Send button
    this.sendButton.addEventListener("click", () => this.sendMessage());

    // Attach button
    this.attachButton?.addEventListener("click", () => this.showAttachmentMenu());
    
    // Input area
    this.inputArea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // Auto-resize textarea
    this.inputArea.addEventListener("input", () => {
      this.inputArea.style.height = "auto";
      this.inputArea.style.height = Math.min(this.inputArea.scrollHeight, 120) + "px";
    });

    // Clipboard paste for images
    this.inputArea.addEventListener("paste", (event) => this.handlePaste(event));
    
    // Provider select
    this.providerSelect.addEventListener("change", (e) => {
      this.onProviderChange(e.target.value);
    });
    
    // Model select
    this.modelSelect.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultModel", e.target.value, true);
    });
    
    // Quick actions
    document.getElementById("zai-quick-actions").addEventListener("click", (e) => {
      const btn = e.target.closest(".zai-action-btn");
      if (btn) {
        this.handleQuickAction(btn.dataset.action);
      }
    });
    
    // Auth button
    document.getElementById("zai-auth-btn")?.addEventListener("click", () => {
      this.showAuthDialog();
    });
    
    // Pin button
    document.getElementById("zai-pin-btn")?.addEventListener("click", () => {
      this.togglePinned();
    });
    
    // Settings button
    document.getElementById("zai-settings-btn")?.addEventListener("click", () => {
      this.openSettings();
    });
  },

  showAttachmentMenu() {
    const existing = document.querySelector(".zai-attachment-menu");
    if (existing) existing.remove();

    const doc = document;
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const createEl = (tag, attrs = {}) => {
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
      return el;
    };

    const menu = createEl("div", { className: "zai-attachment-menu" });
    const header = createEl("div", { className: "zai-attachment-menu-header", textContent: "Attach Image" });
    const actions = createEl("div", { className: "zai-attachment-menu-actions" });

    const uploadBtn = createEl("button", { className: "zai-attachment-btn", textContent: "Upload image" });
    uploadBtn.addEventListener("click", () => {
      menu.remove();
      this.handleAttachUpload();
    });

    const captureBtn = createEl("button", { className: "zai-attachment-btn", textContent: "Capture PDF page" });
    captureBtn.addEventListener("click", async () => {
      menu.remove();
      await this.handleAttachCapture();
    });

    actions.appendChild(uploadBtn);
    actions.appendChild(captureBtn);
    menu.appendChild(header);
    menu.appendChild(actions);

    const closeHandler = (event) => {
      if (!menu.contains(event.target)) {
        menu.remove();
        doc.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => doc.addEventListener("click", closeHandler), 0);

    const inputArea = document.querySelector(".zai-input-area");
    inputArea?.insertAdjacentElement("beforebegin", menu);
  },

  async handleAttachUpload() {
    const input = document.createElementNS("http://www.w3.org/1999/xhtml", "input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const dataUrl = await this.readFileAsDataUrl(file);
        await this.addImageAttachment(dataUrl, { name: file.name, source: "upload" });
      } catch (error) {
        this.showToast("Failed to load image");
      }
      input.remove();
    });
    input.style.display = "none";
    document.body.appendChild(input);
    input.click();
  },

  async handleAttachCapture() {
    const pdfReader = this.getPDFReader();
    if (!pdfReader?.captureCurrentPageImage) {
      this.showToast("PDF capture not available");
      return;
    }
    const result = await pdfReader.captureCurrentPageImage({
      maxDimension: this.MAX_IMAGE_DIMENSION,
      quality: this.IMAGE_QUALITY
    });
    if (result?.dataUrl) {
      await this.addImageAttachment(result.dataUrl, { source: "pdf", page: result.pageNumber });
    } else {
      this.showToast(result?.error || "No PDF page image available");
    }
  },

  async addImageAttachment(dataUrl, meta = {}) {
    if (this.pendingImages.length >= this.MAX_IMAGE_ATTACHMENTS) {
      this.showToast("Too many images attached");
      return;
    }

    try {
      const normalized = await this.normalizeImageDataUrl(dataUrl);
      if (!normalized) return;
      this.pendingImages.push({ ...normalized, ...meta });
      this.renderPendingImages();
    } catch (error) {
      this.showToast("Failed to process image");
    }
  },

  async handlePaste(event) {
    const items = event?.clipboardData?.items;
    if (!items) return;

    const imageItems = [];
    let hasText = false;
    for (const item of items) {
      if (item.type && item.type.startsWith("image/")) {
        imageItems.push(item);
      } else if (item.type === "text/plain") {
        hasText = true;
      }
    }

    if (!imageItems.length) return;
    if (!hasText) {
      event.preventDefault();
    }

    for (const item of imageItems) {
      const file = item.getAsFile?.();
      if (!file) continue;
      try {
        const dataUrl = await this.readFileAsDataUrl(file);
        await this.addImageAttachment(dataUrl, {
          name: file.name || "clipboard-image.png",
          source: "clipboard"
        });
      } catch (error) {
        this.showToast("Failed to paste image");
      }
    }
  },

  renderPendingImages() {
    if (!this.attachmentsContainer) return;
    while (this.attachmentsContainer.firstChild) {
      this.attachmentsContainer.removeChild(this.attachmentsContainer.firstChild);
    }
    if (!this.pendingImages.length) {
      this.attachmentsContainer.style.display = "none";
      return;
    }
    this.attachmentsContainer.style.display = "flex";

    this.pendingImages.forEach((image, index) => {
      const wrapper = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      wrapper.className = "zai-attachment";

      const img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
      img.src = image.dataUrl;
      img.alt = image.name || "Attachment";

      const removeBtn = document.createElementNS("http://www.w3.org/1999/xhtml", "button");
      removeBtn.className = "zai-attachment-remove";
      removeBtn.type = "button";
      removeBtn.textContent = "x";
      removeBtn.addEventListener("click", () => {
        this.pendingImages.splice(index, 1);
        this.renderPendingImages();
      });

      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      this.attachmentsContainer.appendChild(wrapper);
    });
  },

  clearPendingImages() {
    this.pendingImages = [];
    this.renderPendingImages();
  },

  async readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  },

  async normalizeImageDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== "string") {
      this.showToast("Invalid image");
      return null;
    }
    const ImageCtor = window.Image || Image;
    return new Promise((resolve, reject) => {
      const img = new ImageCtor();
      img.onload = () => {
        const maxDim = this.MAX_IMAGE_DIMENSION;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not available"));
          return;
        }
        ctx.drawImage(img, 0, 0, targetW, targetH);
        const output = canvas.toDataURL("image/jpeg", this.IMAGE_QUALITY);
        const sizeBytes = this.getDataUrlSizeBytes(output);
        if (sizeBytes > this.MAX_IMAGE_BYTES) {
          this.showToast("Image too large");
          reject(new Error("Image too large"));
          return;
        }
        resolve({
          dataUrl: output,
          width: targetW,
          height: targetH,
          sizeBytes
        });
      };
      img.onerror = () => reject(new Error("Image load failed"));
      img.src = dataUrl;
    });
  },

  getDataUrlSizeBytes(dataUrl) {
    const commaIndex = dataUrl.indexOf(",");
    const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
    return Math.floor((base64.length * 3) / 4);
  },
  
  /**
   * Setup listener for Zotero item selection changes
   */
  setupItemListener() {
    // Get the main Zotero window
    const mainWindow = Services.wm.getMostRecentWindow("navigator:browser");
    if (!mainWindow || !mainWindow.ZoteroPane) return;
    
    // Listen for selection changes
    const itemsView = mainWindow.ZoteroPane.itemsView;
    if (itemsView) {
      this._selectionListener = {
        notify: (event, type, ids, extraData) => {
          if (type === "select") {
            this.loadCurrentItem();
          }
        }
      };
      
      // Register with Zotero's notifier
      Zotero.Notifier.registerObserver(this._selectionListener, ["item"]);
    }
  },
  
  /**
   * Load the currently selected item from Zotero
   */
  loadCurrentItem() {
    const mainWindow = Services.wm.getMostRecentWindow("navigator:browser");
    if (!mainWindow || !mainWindow.ZoteroPane) {
      this.setItem(null);
      return;
    }
    
    const selectedItems = mainWindow.ZoteroPane.getSelectedItems();
    if (selectedItems.length === 1 && selectedItems[0].isRegularItem()) {
      this.setItem(selectedItems[0]);
    } else {
      this.setItem(null);
    }
  },
  
  /**
   * Set the current item
   */
  setItem(item) {
    this.currentItem = item;
    this.clearPendingImages();
    
    if (item) {
      this.paperTitleEl.textContent = item.getField("title") || "Untitled";
      this.paperTitleEl.title = item.getField("title") || "";
      
      // Load conversation for this item
      ZoteroAIAssistant.ChatManager.setCurrentItem(item);
      const messages = ZoteroAIAssistant.ChatManager.getDisplayMessages();
      
      if (messages.length > 0) {
        this.messagesContainer.innerHTML = "";
        for (const msg of messages) {
          if (msg.role === "user" || msg.role === "assistant") {
            this.appendMessage(msg.role, msg.content, msg.images);
          }
        }
      } else {
        this.showWelcome();
      }
    } else {
      this.paperTitleEl.textContent = "No paper selected";
      this.showWelcome("Select a paper in Zotero to start chatting");
    }
  },
  
  /**
   * Show welcome message
   */
  showWelcome(message = "Ask me anything about your paper!") {
    this.messagesContainer.innerHTML = `
      <div class="zai-welcome">
        <div class="zai-welcome-icon">AI</div>
        <div class="zai-welcome-text">${message}</div>
      </div>
    `;
  },
  
  /**
   * Handle provider change
   */
  onProviderChange(provider) {
    Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultProvider", provider, true);
    
    const defaultModel = ZoteroAIAssistant.ModelRegistry.getDefaultModel(provider);
    this.updateModelOptions(provider, defaultModel.id);
    
    Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultModel", defaultModel.id, true);
    
    this.loadAuthStatus();
  },
  
  /**
   * Load authentication status
   */
  async loadAuthStatus() {
    const authStatus = document.getElementById("zai-auth-status");
    const statusText = authStatus?.querySelector(".zai-status-text");
    const authBtn = document.getElementById("zai-auth-btn");
    
    if (!authStatus) return;
    
    const provider = this.providerSelect.value;
    
    try {
      let isAuthenticated = false;
      
      if (provider === "copilot") {
        isAuthenticated = await ZoteroAIAssistant.GitHubDeviceFlow.hasValidSession();
      } else {
        isAuthenticated = await ZoteroAIAssistant.OpenAICodexOAuth.hasValidSession();
      }
      
      if (isAuthenticated) {
        authStatus.style.display = "none";
      } else {
        authStatus.style.display = "flex";
        authStatus.className = "zai-auth-status zai-auth-required";
        statusText.textContent = provider === "copilot" 
          ? "Connect to GitHub Copilot" 
          : "Connect to OpenAI Codex";
        authBtn.textContent = "Connect";
      }
    } catch (error) {
      authStatus.style.display = "flex";
      statusText.textContent = "Not connected";
    }
  },
  
  /**
   * Send a message
   */
  async sendMessage(options = {}) {
    const content = this.inputArea.value?.trim() || "";
    const images = this.pendingImages.map(image => image.dataUrl);
    if ((!content && images.length === 0) || this.isStreaming) return;
    
    if (!this.currentItem) {
      this.showError("Please select a paper first");
      return;
    }
    
    // Check authentication
    const provider = this.providerSelect.value;
    let isAuthenticated = false;
    
    try {
      if (provider === "copilot") {
        isAuthenticated = await ZoteroAIAssistant.GitHubDeviceFlow.hasValidSession();
      } else {
        isAuthenticated = await ZoteroAIAssistant.OpenAICodexOAuth.hasValidSession();
      }
    } catch (e) {}
    
    if (!isAuthenticated) {
      this.showAuthDialog();
      return;
    }
    
    // Clear input
    this.inputArea.value = "";
    this.inputArea.style.height = "auto";
    
    // Clear welcome message
    const welcome = this.messagesContainer.querySelector(".zai-welcome");
    if (welcome) welcome.remove();
    
    // Add user message
    this.appendMessage("user", content, images);
    this.clearPendingImages();
    
    // Add assistant placeholder
    const assistantMsg = this.appendMessage("assistant", "");
    const contentEl = assistantMsg.querySelector(".zai-message-content");
    contentEl.innerHTML = '<span class="zai-typing">Thinking...</span>';
    
    this.isStreaming = true;
    const view = document.defaultView;
    const AbortControllerCtor = view?.AbortController || (typeof AbortController !== "undefined" ? AbortController : null);
    this.abortController = AbortControllerCtor ? new AbortControllerCtor() : null;
    this.updateSendButton();
    
    try {
      let fullResponse = "";
      const signal = this.abortController?.signal;
      
      const result = await ZoteroAIAssistant.ChatManager.sendMessage(content, {
        item: this.currentItem,
        signal,
        images,
        task: options.task,
        onChunk: (chunk) => {
          fullResponse += chunk;
          contentEl.innerHTML = this.renderMarkdown(fullResponse);
          this.scrollToBottom();
        }
      });
      
      if (result.success) {
        contentEl.innerHTML = this.renderMarkdown(result.content);
      } else {
        contentEl.innerHTML = `<span class="zai-error">Error: ${result.error}</span>`;
      }
    } catch (error) {
      if (error.name === "AbortError") {
        contentEl.innerHTML = "<em>Message cancelled</em>";
      } else {
        contentEl.innerHTML = `<span class="zai-error">Error: ${error.message}</span>`;
      }
    } finally {
      this.isStreaming = false;
      this.abortController = null;
      this.updateSendButton();
      this.scrollToBottom();
    }
  },
  
  /**
   * Handle quick actions
   */
  async handleQuickAction(action) {
    const prompts = {
      summarize: "Please provide a concise summary of this paper, including the main objective, methodology, and key conclusions.",
      keypoints: "What are the key points and main takeaways from this paper? Please list them in order of importance.",
      methods: "Explain the methodology used in this paper. What approaches, techniques, or experiments were conducted?",
      findings: "What are the main findings and results of this paper? Include any significant data or statistics."
    };
    
    const prompt = prompts[action];
    if (prompt) {
      this.inputArea.value = prompt;
      await this.sendMessage({ task: action });
    }
  },
  
  /**
   * Append a message to chat
   */
  appendMessage(role, content, images = []) {
    const msgEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    msgEl.className = `zai-message zai-message-${role}`;
    
    const contentEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
    contentEl.className = "zai-message-content";
    contentEl.innerHTML = role === "assistant" ? this.renderMarkdown(content) : this.escapeHtml(content);
    
    msgEl.appendChild(contentEl);

    if (Array.isArray(images) && images.length) {
      const attachmentsEl = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      attachmentsEl.className = "zai-message-attachments";
      for (const image of images) {
        const img = document.createElementNS("http://www.w3.org/1999/xhtml", "img");
        img.src = image;
        img.alt = "Attachment";
        attachmentsEl.appendChild(img);
      }
      msgEl.appendChild(attachmentsEl);
    }
    this.messagesContainer.appendChild(msgEl);
    
    this.scrollToBottom();
    return msgEl;
  },
  
  /**
   * Render markdown to HTML
   */
  renderMarkdown(text) {
    if (!text) return "";
    
    let html = this.escapeHtml(text);
    
    // Code blocks
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    
    // Lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    
    // Line breaks
    html = html.replace(/\n/g, '<br>');
    
    // Clean up code blocks
    html = html.replace(/<pre><code([^>]*)>([\s\S]*?)<\/code><\/pre>/g, (match, attrs, code) => {
      return `<pre><code${attrs}>${code.replace(/<br>/g, '\n')}</code></pre>`;
    });
    
    return html;
  },
  
  /**
   * Escape HTML
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },
  
  /**
   * Scroll to bottom
   */
  scrollToBottom() {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  },
  
  /**
   * Update send button state
   */
  updateSendButton() {
    if (this.isStreaming) {
      this.sendButton.textContent = "Stop";
      this.sendButton.title = "Stop";
      this.sendButton.onclick = () => this.abortController?.abort();
    } else {
      this.sendButton.textContent = "Send";
      this.sendButton.title = "Send message";
      this.sendButton.onclick = () => this.sendMessage();
    }
  },
  
  /**
   * Toggle pinned/always-on-top state
   */
  togglePinned() {
    this.isPinned = !this.isPinned;
    
    // Update window z-order
    if (this.isPinned) {
      window.document.documentElement.setAttribute("always-on-top", "true");
    } else {
      window.document.documentElement.removeAttribute("always-on-top");
    }
    
    // Update button state
    const pinBtn = document.getElementById("zai-pin-btn");
    if (pinBtn) {
      pinBtn.classList.toggle("active", this.isPinned);
    }
  },
  
  /**
   * Open settings
   */
  openSettings() {
    Zotero.Utilities.Internal.openPreferences("zotero-ai-assistant");
  },
  
  /**
   * Show auth dialog
   */
  showAuthDialog() {
    const provider = this.providerSelect.value;
    
    if (typeof ZoteroAIAssistant.openAuthDialog === "function") {
      ZoteroAIAssistant.openAuthDialog(provider);
    } else {
      Services.ww.openWindow(
        window,
        "chrome://zotero-ai-assistant/content/ui/authDialog.xhtml",
        "ZoteroAIAssistantAuth",
        "chrome,dialog,modal,centerscreen,width=400,height=350",
        { provider }
      );
    }
    
    this.loadAuthStatus();
  },
  
  /**
   * Show error message
   */
  showToast(message) {
    let toast = document.querySelector(".zai-toast");
    if (!toast) {
      toast = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      toast.className = "zai-toast";
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.add("zai-toast-visible");

    setTimeout(() => {
      toast.classList.remove("zai-toast-visible");
    }, 2000);
  },

  /**
   * Show error message
   */
  showError(message) {
    // Show temporary error toast
    const toast = document.createElement("div");
    toast.className = "zai-toast zai-toast-error";
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
  },
  
  /**
   * Clean up
   */
  destroy() {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    if (this._selectionListener) {
      Zotero.Notifier.unregisterObserver(this._selectionListener);
    }
    
    Zotero.debug("ZoteroAIAssistantFloating: Destroyed");
  }
};
