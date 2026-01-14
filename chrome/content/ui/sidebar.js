/**
 * Sidebar UI Controller
 * 
 * Manages the AI Assistant sidebar panel in Zotero's item pane.
 * Handles chat interactions, model selection, and quick actions.
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.Sidebar = {
  // DOM references
  container: null,
  messagesContainer: null,
  inputArea: null,
  sendButton: null,
  attachmentsContainer: null,
  attachButton: null,
  providerSelect: null,
  modelSelect: null,
  
  // State
  currentItem: null,
  isStreaming: false,
  abortController: null,
  pendingImages: [],
  MAX_IMAGE_ATTACHMENTS: 4,
  MAX_IMAGE_BYTES: 2 * 1024 * 1024,
  MAX_IMAGE_DIMENSION: 1024,
  IMAGE_QUALITY: 0.85,
  
  /**
   * Initialize the sidebar for a given container element
   */
  init(container, item) {
    this.container = container;
    this.currentItem = item;
    this.pendingImages = [];
    
    this.render();
    this.bindEvents();
    this.loadAuthStatus();
    this.loadConversation();
    
    // Load local models if a local provider is selected
    const provider = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultProvider", true) || "copilot";
    if (provider === "ollama" || provider === "lmstudio") {
      this.loadLocalModels(provider);
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
   * Render the sidebar UI
   */
  render() {
    if (!this.container) return;
    
    const provider = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultProvider", true) || "copilot";
    const modelId = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "grok-code-fast-1";

    const doc = this.container.ownerDocument;
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const SVG_NS = "http://www.w3.org/2000/svg";
    const createEl = (tag, attrs = {}, ns = XHTML_NS) => {
      const el = doc.createElementNS(ns, tag);
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

    while (this.container.firstChild) {
      this.container.removeChild(this.container.firstChild);
    }

    const chatContainer = createEl("div", { className: "zai-chat-container" });

    const authStatus = createEl("div", { className: "zai-auth-status", id: "zai-auth-status" });
    authStatus.style.display = "none";
    const statusText = createEl("span", { className: "zai-status-text" });
    const authBtn = createEl("button", { className: "zai-auth-btn", id: "zai-auth-btn", textContent: "Connect" });
    authStatus.appendChild(statusText);
    authStatus.appendChild(authBtn);

    const providerSelector = createEl("div", { className: "zai-provider-selector", id: "zai-provider-selector" });

    const messages = createEl("div", { className: "zai-messages", id: "zai-messages" });
    messages.appendChild(this.buildWelcomeMessage(doc, "Ask me anything about this paper!"));

    const quickActions = createEl("div", { className: "zai-quick-actions", id: "zai-quick-actions" });
    const actionButtons = [
      { action: "summarize", label: "Summarize", className: "zai-action-btn" },
      { action: "keypoints", label: "Key Points", className: "zai-action-btn" },
      { action: "methods", label: "Methods", className: "zai-action-btn" },
      { action: "findings", label: "Findings", className: "zai-action-btn" },
      { action: "cite", label: "Cite", className: "zai-action-btn zai-cite-btn" },
      { action: "compare", label: "Compare", className: "zai-action-btn" }
    ];
    for (const action of actionButtons) {
      const btn = createEl("button", {
        className: action.className,
        textContent: action.label,
        "data-action": action.action
      });
      quickActions.appendChild(btn);
    }

    const exportActions = createEl("div", { className: "zai-export-actions", id: "zai-export-actions" });
    exportActions.style.display = "none";
    const exportButtons = [
      { action: "clipboard", label: "Copy", title: "Copy to clipboard" },
      { action: "markdown", label: "Markdown", title: "Copy as Markdown" },
      { action: "note", label: "Save Note", title: "Save to Zotero note" },
      { action: "clear", label: "Clear", title: "Clear conversation" }
    ];
    for (const action of exportButtons) {
      const btn = createEl("button", {
        className: "zai-export-btn",
        textContent: action.label,
        title: action.title,
        "data-export": action.action
      });
      exportActions.appendChild(btn);
    }

    const attachments = createEl("div", { className: "zai-attachments", id: "zai-attachments" });
    const inputArea = createEl("div", { className: "zai-input-area" });
    const attachBtn = createEl("button", { id: "zai-attach-btn", className: "zai-attach-btn", title: "Attach image" });
    const attachSvg = createEl(
      "svg",
      {
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2"
      },
      SVG_NS
    );
    const attachPath = createEl("path", { d: "M12 5v14M5 12h14" }, SVG_NS);
    attachSvg.appendChild(attachPath);
    attachBtn.appendChild(attachSvg);
    const textarea = createEl("textarea", { id: "zai-input", placeholder: "Ask about this paper...", rows: "1" });
    const sendBtn = createEl("button", { id: "zai-send-btn", title: "Send message" });
    const svg = createEl(
      "svg",
      {
        width: "16",
        height: "16",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        "stroke-width": "2"
      },
      SVG_NS
    );
    const path = createEl("path", { d: "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" }, SVG_NS);
    svg.appendChild(path);
    sendBtn.appendChild(svg);
    inputArea.appendChild(attachBtn);
    inputArea.appendChild(textarea);
    inputArea.appendChild(sendBtn);

    chatContainer.appendChild(authStatus);
    chatContainer.appendChild(providerSelector);
    chatContainer.appendChild(messages);
    chatContainer.appendChild(quickActions);
    chatContainer.appendChild(exportActions);
    chatContainer.appendChild(attachments);
    chatContainer.appendChild(inputArea);
    this.container.appendChild(chatContainer);

    // Cache DOM references
    this.messagesContainer = messages;
    this.inputArea = textarea;
    this.sendButton = sendBtn;
    this.attachmentsContainer = attachments;
    this.attachButton = attachBtn;
    this.renderPendingImages();

    // Create dropdowns using DOM methods (innerHTML doesn't work well for selects in Zotero)
    this.createProviderDropdowns(provider, modelId);
  },

  buildWelcomeMessage(doc, message) {
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const welcome = doc.createElementNS(XHTML_NS, "div");
    welcome.className = "zai-welcome";

    const icon = doc.createElementNS(XHTML_NS, "div");
    icon.className = "zai-welcome-icon";
    icon.textContent = "AI";

    const text = doc.createElementNS(XHTML_NS, "div");
    text.className = "zai-welcome-text";
    text.textContent = message;

    welcome.appendChild(icon);
    welcome.appendChild(text);
    return welcome;
  },
  
  /**
   * Create provider and model dropdowns using DOM methods
   */
  createProviderDropdowns(currentProvider, currentModel) {
    const selectorDiv = this.container.querySelector("#zai-provider-selector");
    if (!selectorDiv) return;
    
    // Clear existing content
    while (selectorDiv.firstChild) {
      selectorDiv.removeChild(selectorDiv.firstChild);
    }
    
    // Use XHTML namespace for proper rendering in Zotero
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const doc = this.container.ownerDocument;
    
    // Create provider select using XHTML namespace
    const providerSelect = doc.createElementNS(XHTML_NS, "select");
    providerSelect.id = "zai-provider-select";
    providerSelect.className = "zai-dropdown";
    
    const providers = [
      { value: "copilot", label: "GitHub Copilot" },
      { value: "ollama", label: "Ollama (Local)" },
      { value: "lmstudio", label: "LM Studio (Local)" }
    ];
    
    for (const p of providers) {
      const opt = doc.createElementNS(XHTML_NS, "option");
      opt.value = p.value;
      opt.textContent = p.label;
      if (p.value === currentProvider) opt.selected = true;
      providerSelect.appendChild(opt);
    }
    
    selectorDiv.appendChild(providerSelect);
    this.providerSelect = providerSelect;
    
    // Create model select using XHTML namespace
    const modelSelect = doc.createElementNS(XHTML_NS, "select");
    modelSelect.id = "zai-model-select";
    modelSelect.className = "zai-dropdown";
    this.populateModelSelect(modelSelect, currentProvider, currentModel);
    
    selectorDiv.appendChild(modelSelect);
    this.modelSelect = modelSelect;
  },
  
  /**
   * Populate model select with options
   */
  populateModelSelect(selectEl, provider, selectedModelId) {
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const doc = selectEl.ownerDocument;
    
    // Clear existing options
    while (selectEl.firstChild) {
      selectEl.removeChild(selectEl.firstChild);
    }
    
    if (provider === "copilot") {
      const grouped = ZoteroAIAssistant.ModelRegistry.getCopilotModelsByProvider();
      const providerOrder = ["xai", "anthropic", "google", "openai", "other"];
      
      for (const providerKey of providerOrder) {
        const providerModels = grouped[providerKey];
        if (!providerModels || providerModels.length === 0) continue;
        
        const providerName = ZoteroAIAssistant.ModelRegistry.getProviderName(providerKey);
        
        // Add group header
        const header = doc.createElementNS(XHTML_NS, "option");
        header.disabled = true;
        header.textContent = `[${providerName}]`;
        selectEl.appendChild(header);
        
        for (const model of providerModels) {
          const opt = doc.createElementNS(XHTML_NS, "option");
          opt.value = model.id;
          opt.textContent = `  ${model.name}`;
          if (model.id === selectedModelId) opt.selected = true;
          selectEl.appendChild(opt);
        }
      }
    } else {
      // Local models - placeholder, will be populated async
      const opt = doc.createElementNS(XHTML_NS, "option");
      opt.value = "";
      opt.textContent = "Loading models...";
      selectEl.appendChild(opt);
    }
  },
  
  /**
   * Load local models asynchronously
   */
  async loadLocalModels(provider) {
    if (!ZoteroAIAssistant.LocalModelClient || !this.modelSelect) return;
    
    const XHTML_NS = "http://www.w3.org/1999/xhtml";
    const doc = this.modelSelect.ownerDocument;
    
    // Clear and show loading
    while (this.modelSelect.firstChild) {
      this.modelSelect.removeChild(this.modelSelect.firstChild);
    }
    const loadingOpt = doc.createElementNS(XHTML_NS, "option");
    loadingOpt.value = "";
    loadingOpt.textContent = "Loading models...";
    this.modelSelect.appendChild(loadingOpt);
    
    try {
      const models = await ZoteroAIAssistant.LocalModelClient.getModels(provider);
      
      while (this.modelSelect.firstChild) {
        this.modelSelect.removeChild(this.modelSelect.firstChild);
      }
      
      if (models.length === 0) {
        const opt = doc.createElementNS(XHTML_NS, "option");
        opt.value = "";
        opt.textContent = `No models found - start ${provider === "ollama" ? "Ollama" : "LM Studio"} server`;
        this.modelSelect.appendChild(opt);
        return;
      }
      
      const storedModel = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "";
      const modelIds = new Set(models.map(model => model.id));
      const selectedModel = modelIds.has(storedModel) ? storedModel : models[0].id;

      if (selectedModel !== storedModel) {
        Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultModel", selectedModel, true);
      }
      
      for (const model of models) {
        const opt = doc.createElementNS(XHTML_NS, "option");
        opt.value = model.id;
        opt.textContent = model.name;
        if (model.id === selectedModel) opt.selected = true;
        this.modelSelect.appendChild(opt);
      }
    } catch (e) {
      Zotero.debug("Error loading local models: " + e);
      while (this.modelSelect.firstChild) {
        this.modelSelect.removeChild(this.modelSelect.firstChild);
      }
      const opt = doc.createElementNS(XHTML_NS, "option");
      opt.value = "";
      opt.textContent = "Error loading models";
      this.modelSelect.appendChild(opt);
    }
  },
  
  /**
   * Bind event listeners
   */
  bindEvents() {
    // Send button
    this.sendButton?.addEventListener("click", () => this.sendMessage());
    
    // Input area - Enter to send, Shift+Enter for newline
    this.inputArea?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    // Auto-resize textarea
    this.inputArea?.addEventListener("input", () => {
      this.inputArea.style.height = "auto";
      this.inputArea.style.height = Math.min(this.inputArea.scrollHeight, 120) + "px";
    });
    
    // Provider select
    this.providerSelect?.addEventListener("change", (e) => {
      this.onProviderChange(e.target.value);
    });
    
    // Model select
    this.modelSelect?.addEventListener("change", (e) => {
      Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultModel", e.target.value, true);
    });
    
    // Quick actions
    const quickActions = this.container?.querySelector("#zai-quick-actions");
    quickActions?.addEventListener("click", (e) => {
      const btn = e.target.closest(".zai-action-btn");
      if (btn) {
        this.handleQuickAction(btn.dataset.action);
      }
    });
    
    // Export actions
    const exportActions = this.container?.querySelector("#zai-export-actions");
    exportActions?.addEventListener("click", (e) => {
      const btn = e.target.closest(".zai-export-btn");
      if (btn) {
        this.handleExportAction(btn.dataset.export);
      }
    });
    
    // Auth button
    const authBtn = this.container?.querySelector("#zai-auth-btn");
    authBtn?.addEventListener("click", () => this.showAuthDialog());

    // Attach button
    this.attachButton?.addEventListener("click", () => this.showAttachmentMenu());

    // Clipboard paste for images
    this.inputArea?.addEventListener("paste", (event) => this.handlePaste(event));
  },

  showAttachmentMenu() {
    // Remove existing menu
    const existing = this.container?.querySelector(".zai-attachment-menu");
    if (existing) existing.remove();

    const doc = this.container?.ownerDocument || document;
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

    const inputArea = this.container?.querySelector(".zai-input-area");
    inputArea?.insertAdjacentElement("beforebegin", menu);
  },

  async handleAttachUpload() {
    const doc = this.container?.ownerDocument || document;
    const input = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
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
    doc.body?.appendChild(input);
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
      await this.addImageAttachment(result.dataUrl, {
        source: "pdf",
        page: result.pageNumber
      });
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

    const doc = this.attachmentsContainer.ownerDocument;
    this.attachmentsContainer.style.display = "flex";
    this.pendingImages.forEach((image, index) => {
      const wrapper = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      wrapper.className = "zai-attachment";

      const img = doc.createElementNS("http://www.w3.org/1999/xhtml", "img");
      img.src = image.dataUrl;
      img.alt = image.name || "Attachment";

      const removeBtn = doc.createElementNS("http://www.w3.org/1999/xhtml", "button");
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
    const doc = this.container?.ownerDocument || document;
    const view = doc.defaultView;
    const ImageCtor = view?.Image || Image;
    return new Promise((resolve, reject) => {
      const img = new ImageCtor();
      img.onload = () => {
        const maxDim = this.MAX_IMAGE_DIMENSION;
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1);
        const targetW = Math.max(1, Math.round(img.width * scale));
        const targetH = Math.max(1, Math.round(img.height * scale));
        const canvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
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
   * Handle export action
   */
  async handleExportAction(action) {
    const messages = ZoteroAIAssistant.ChatManager?.getDisplayMessages() || [];
    
    if (messages.length === 0 && action !== "clear") {
      return;
    }
    
    switch (action) {
      case "clipboard":
        if (ZoteroAIAssistant.ExportHelper?.copyAsPlainText(messages)) {
          this.showToast("Copied to clipboard");
        }
        break;
        
      case "markdown":
        if (ZoteroAIAssistant.ExportHelper?.copyAsMarkdown(messages, this.currentItem)) {
          this.showToast("Copied as Markdown");
        }
        break;
        
      case "note":
        if (this.currentItem) {
          const noteId = await ZoteroAIAssistant.ExportHelper?.exportToNote(messages, this.currentItem.id);
          if (noteId) {
            this.showToast("Saved to note");
          } else {
            this.showToast("Failed to save note");
          }
        } else {
          this.showToast("No paper selected");
        }
        break;
        
      case "clear":
        ZoteroAIAssistant.ChatManager?.clearConversation();
        this.clearMessages();
        this.updateExportVisibility();
        break;
    }
  },
  
  /**
   * Show a temporary toast message
   */
  showToast(message) {
    // Create toast element
    let toast = this.container?.querySelector(".zai-toast");
    if (!toast) {
      const doc = this.container?.ownerDocument || document;
      toast = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      toast.className = "zai-toast";
      this.container?.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.classList.add("zai-toast-visible");
    
    setTimeout(() => {
      toast.classList.remove("zai-toast-visible");
    }, 2000);
  },
  
  /**
   * Update export actions visibility
   */
  updateExportVisibility() {
    const exportActions = this.container?.querySelector("#zai-export-actions");
    const messages = ZoteroAIAssistant.ChatManager?.getDisplayMessages() || [];
    
    if (exportActions) {
      exportActions.style.display = messages.length > 0 ? "flex" : "none";
    }
  },
  
  /**
   * Clear messages display
   */
  clearMessages() {
    if (!this.messagesContainer) return;
    while (this.messagesContainer.firstChild) {
      this.messagesContainer.removeChild(this.messagesContainer.firstChild);
    }
    const doc = this.messagesContainer.ownerDocument;
    this.messagesContainer.appendChild(this.buildWelcomeMessage(doc, "Ask me anything about this paper!"));
    this.clearPendingImages();
  },
  
  /**
   * Handle provider change
   */
  async onProviderChange(provider) {
    Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultProvider", provider, true);
    
    if (provider === "ollama" || provider === "lmstudio") {
      // Local models - load async
      await this.loadLocalModels(provider);
    } else {
      // Copilot models - repopulate using DOM methods
      const defaultModel = ZoteroAIAssistant.ModelRegistry.getDefaultModel(provider);
      this.populateModelSelect(this.modelSelect, provider, defaultModel.id);
      Zotero.Prefs.set("extensions.zotero-ai-assistant.defaultModel", defaultModel.id, true);
    }
    
    // Update auth status
    this.loadAuthStatus();
  },
  
  /**
   * Load and display authentication status
   */
  async loadAuthStatus() {
    const authStatus = this.container?.querySelector("#zai-auth-status");
    const statusText = authStatus?.querySelector(".zai-status-text");
    const authBtn = authStatus?.querySelector("#zai-auth-btn");
    
    if (!authStatus) return;
    
    const provider = this.providerSelect?.value || "copilot";
    
    try {
      let isAuthenticated = false;
      
      if (provider === "copilot") {
        isAuthenticated = await ZoteroAIAssistant.GitHubDeviceFlow.hasValidSession();
      } else if (provider === "ollama" || provider === "lmstudio") {
        // Local models don't need authentication
        authStatus.style.display = "none";
        return;
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
      Zotero.debug("ZoteroAIAssistant.Sidebar: Error checking auth: " + error);
      authStatus.style.display = "flex";
      authStatus.className = "zai-auth-status zai-auth-required";
      statusText.textContent = "Not connected";
      authBtn.textContent = "Connect";
    }
  },
  
  /**
   * Load conversation history for current item
   */
  loadConversation() {
    if (!this.currentItem || !this.messagesContainer) return;
    
    ZoteroAIAssistant.ChatManager.setCurrentItem(this.currentItem);
    const messages = ZoteroAIAssistant.ChatManager.getDisplayMessages();
    
    if (messages.length > 0) {
      // Clear welcome message
      while (this.messagesContainer.firstChild) {
        this.messagesContainer.removeChild(this.messagesContainer.firstChild);
      }
      
      // Render existing messages
      for (const msg of messages) {
        if (msg.role === "user" || msg.role === "assistant") {
          this.appendMessage(msg.role, msg.content, msg.images);
        }
      }
      
      this.scrollToBottom();
    }
  },
  
  /**
   * Send a message
   */
  async sendMessage(options = {}) {
    const content = this.inputArea?.value?.trim() || "";
    const images = this.pendingImages.map(image => image.dataUrl);
    if ((!content && images.length === 0) || this.isStreaming) return;
    
    // Check authentication
    const provider = this.providerSelect?.value || "copilot";
    
    // Local providers don't need auth
    if (provider === "copilot") {
      let isAuthenticated = false;
      try {
        isAuthenticated = await ZoteroAIAssistant.GitHubDeviceFlow.hasValidSession();
      } catch (e) {
        // Not authenticated
      }
      
      if (!isAuthenticated) {
        this.showAuthDialog();
        return;
      }
    }
    
    // Clear input
    this.inputArea.value = "";
    this.inputArea.style.height = "auto";
    
    // Clear welcome message if present
    const welcome = this.messagesContainer?.querySelector(".zai-welcome");
    if (welcome) {
      welcome.remove();
    }
    
    // Add user message
    this.appendMessage("user", content, images);
    this.clearPendingImages();
    
    // Add assistant message placeholder
    const assistantMsg = this.appendMessage("assistant", "");
    const contentEl = assistantMsg.querySelector(".zai-message-content");
    
    // Show typing indicator
    contentEl.innerHTML = '<span class="zai-typing">Thinking...</span>';
    
    this.isStreaming = true;
    const view = this.container?.ownerDocument?.defaultView;
    const AbortControllerCtor = view?.AbortController || (typeof AbortController !== "undefined" ? AbortController : null);
    this.abortController = AbortControllerCtor ? new AbortControllerCtor() : null;
    this.updateSendButton();
    
    try {
      // Get selected text if any
      const pdfReader = this.getPDFReader();
      const selectedText = pdfReader?.getSelectedText?.();
      const signal = this.abortController?.signal;
      
      // Send message with streaming
      let fullResponse = "";
      
      const result = await ZoteroAIAssistant.ChatManager.sendMessage(content, {
        item: this.currentItem,
        selectedText,
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
   * Handle quick action buttons
   */
  async handleQuickAction(action) {
    // Handle citation separately
    if (action === "cite") {
      this.showCitationMenu();
      return;
    }
    
    // Handle comparison separately
    if (action === "compare") {
      await this.handleCompare();
      return;
    }
    
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
   * Handle paper comparison
   */
  async handleCompare() {
    if (!ZoteroAIAssistant.PaperComparison) {
      this.showToast("Comparison module not loaded");
      return;
    }
    
    // Append a "comparing" message
    this.appendMessage("user", "Compare selected papers");
    const loadingMsg = this.appendMessage("assistant", "Analyzing selected papers...");
    
    try {
      const result = await ZoteroAIAssistant.PaperComparison.compareSelected();
      
      if (loadingMsg) {
        loadingMsg.querySelector(".zai-message-content").innerHTML = this.renderMarkdown(result.message);
      }
      
      if (result.success) {
        this.updateExportVisibility();
      }
    } catch (error) {
      if (loadingMsg) {
        loadingMsg.querySelector(".zai-message-content").textContent = "Error comparing papers: " + error.message;
      }
    }
  },
  
  /**
   * Show citation style menu
   */
  showCitationMenu() {
    // Remove existing menu
    const existing = this.container?.querySelector(".zai-citation-menu");
    if (existing) existing.remove();
    
    // Create menu
    const doc = this.container?.ownerDocument || document;
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

    const menu = createEl("div", { className: "zai-citation-menu" });
    const header = createEl("div", {
      className: "zai-citation-menu-header",
      textContent: "Copy Citation"
    });
    const styles = createEl("div", { className: "zai-citation-menu-styles" });
    const styleButtons = [
      { id: "apa", label: "APA" },
      { id: "mla", label: "MLA" },
      { id: "chicago", label: "Chicago" },
      { id: "harvard", label: "Harvard" },
      { id: "ieee", label: "IEEE" },
      { id: "vancouver", label: "Vancouver" }
    ];

    for (const style of styleButtons) {
      const btn = createEl("button", {
        className: "zai-citation-style-btn",
        textContent: style.label,
        "data-style": style.id
      });
      btn.addEventListener("click", async () => {
        if (this.currentItem && ZoteroAIAssistant.CitationHelper) {
          const success = await ZoteroAIAssistant.CitationHelper.copyCitation(this.currentItem, style.id);
          if (success) {
            this.showToast(`${style.label.toUpperCase()} citation copied`);
          }
        }
        menu.remove();
      });
      styles.appendChild(btn);
    }

    const footer = createEl("div", { className: "zai-citation-menu-footer" });
    const inTextBtn = createEl("button", {
      className: "zai-citation-intext-btn",
      textContent: "In-text citation",
      "data-action": "intext"
    });
    inTextBtn.addEventListener("click", () => {
      if (this.currentItem && ZoteroAIAssistant.CitationHelper) {
        const success = ZoteroAIAssistant.CitationHelper.copyInTextCitation(this.currentItem, "apa");
        if (success) {
          this.showToast("In-text citation copied");
        }
      }
      menu.remove();
    });
    footer.appendChild(inTextBtn);

    menu.appendChild(header);
    menu.appendChild(styles);
    menu.appendChild(footer);
    
    // Close on outside click
    const closeHandler = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        doc.removeEventListener("click", closeHandler);
      }
    };
    setTimeout(() => doc.addEventListener("click", closeHandler), 0);
    
    // Insert menu
    const quickActions = this.container?.querySelector("#zai-quick-actions");
    quickActions?.insertAdjacentElement("afterend", menu);
  },
  
  /**
   * Append a message to the chat
   */
  appendMessage(role, content, images = []) {
    const doc = this.messagesContainer?.ownerDocument || document;
    const msgEl = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    msgEl.className = `zai-message zai-message-${role}`;
    
    const contentEl = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    contentEl.className = "zai-message-content";
    contentEl.innerHTML = role === "assistant" ? this.renderMarkdown(content) : this.escapeHtml(content);
    
    msgEl.appendChild(contentEl);

    if (Array.isArray(images) && images.length) {
      const attachmentsEl = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      attachmentsEl.className = "zai-message-attachments";
      for (const image of images) {
        const img = doc.createElementNS("http://www.w3.org/1999/xhtml", "img");
        img.src = image;
        img.alt = "Attachment";
        attachmentsEl.appendChild(img);
      }
      msgEl.appendChild(attachmentsEl);
    }
    this.messagesContainer?.appendChild(msgEl);
    
    this.scrollToBottom();
    return msgEl;
  },
  
  /**
   * Simple markdown rendering (XHTML compatible)
   */
  renderMarkdown(text) {
    if (!text) return "";
    
    let html = text;
    
    // Code blocks first (before escaping)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const escapedCode = this.escapeHtml(code);
      return `<pre class="zai-code-block"><code>${escapedCode}</code></pre>`;
    });
    
    // Now escape the rest but preserve our code blocks
    const codeBlocks = [];
    html = html.replace(/<pre class="zai-code-block">[\s\S]*?<\/pre>/g, (match) => {
      codeBlocks.push(match);
      return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
    });
    
    // Escape HTML in non-code parts
    html = this.escapeHtml(html);
    
    // Restore code blocks
    codeBlocks.forEach((block, i) => {
      html = html.replace(`__CODE_BLOCK_${i}__`, block);
    });
    
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="zai-inline-code">$1</code>');
    
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    
    // Italic (single asterisk)
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    
    // Headers - must be in order from most specific to least
    html = html.replace(/^###### (.+)$/gm, '<h6 class="zai-h6">$1</h6>');
    html = html.replace(/^##### (.+)$/gm, '<h5 class="zai-h5">$1</h5>');
    html = html.replace(/^#### (.+)$/gm, '<h4 class="zai-h4">$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3 class="zai-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="zai-h2">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="zai-h1">$1</h1>');
    
    // Bullet lists
    html = html.replace(/^- (.+)$/gm, '<li class="zai-li">$1</li>');
    
    // Numbered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="zai-li">$1</li>');
    
    // Wrap consecutive li in ul
    html = html.replace(/(<li class="zai-li">[\s\S]*?<\/li>(\n)?)+/g, '<ul class="zai-ul">$&</ul>');
    
    // Line breaks - XHTML format
    html = html.replace(/\n/g, '<br/>');
    
    // Clean up br in code blocks and headers
    html = html.replace(/<pre class="zai-code-block"><code>([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
      return `<pre class="zai-code-block"><code>${code.replace(/<br\/>/g, '\n')}</code></pre>`;
    });
    
    // Remove br after headers
    html = html.replace(/(<\/h[1-6]>)<br\/>/g, '$1');
    
    // Remove br after ul
    html = html.replace(/(<\/ul>)<br\/>/g, '$1');
    
    return html;
  },
  
  /**
   * Escape HTML special characters
   */
  escapeHtml(text) {
    const doc = this.container?.ownerDocument || document;
    const div = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    div.textContent = text;
    return div.innerHTML;
  },
  
  /**
   * Scroll messages to bottom
   */
  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  },
  
  /**
   * Update send button state
   */
  updateSendButton() {
    if (!this.sendButton) return;

    const doc = this.sendButton.ownerDocument;
    const SVG_NS = "http://www.w3.org/2000/svg";
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");

    while (this.sendButton.firstChild) {
      this.sendButton.removeChild(this.sendButton.firstChild);
    }

    if (this.isStreaming) {
      svg.setAttribute("fill", "currentColor");
      const rect = doc.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", "6");
      rect.setAttribute("y", "6");
      rect.setAttribute("width", "12");
      rect.setAttribute("height", "12");
      rect.setAttribute("rx", "2");
      svg.appendChild(rect);
      this.sendButton.title = "Stop";
      this.sendButton.onclick = () => this.abortController?.abort();
    } else {
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "2");
      const path = doc.createElementNS(SVG_NS, "path");
      path.setAttribute("d", "M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z");
      svg.appendChild(path);
      this.sendButton.title = "Send message";
      this.sendButton.onclick = () => this.sendMessage();
    }

    this.sendButton.appendChild(svg);
  },
  
  /**
   * Show authentication dialog
   */
  showAuthDialog() {
    const provider = this.providerSelect?.value || "copilot";
    
    if (typeof ZoteroAIAssistant.openAuthDialog === "function") {
      ZoteroAIAssistant.openAuthDialog(provider);
    } else {
      Services.ww.openWindow(
        Services.wm.getMostRecentWindow("navigator:browser") || null,
        ZoteroAIAssistant.rootURI + "chrome/content/ui/authDialog.xhtml",
        "ZoteroAIAssistantAuth",
        "chrome,dialog,modal,centerscreen,width=400,height=350",
        { provider }
      );
    }
    
    // Refresh auth status after dialog closes
    this.loadAuthStatus();
  },
  
  /**
   * Update for a new item
   */
  setItem(item) {
    this.currentItem = item;
    this.clearPendingImages();
    
    if (!this.messagesContainer) return;
    
    while (this.messagesContainer.firstChild) {
      this.messagesContainer.removeChild(this.messagesContainer.firstChild);
    }
    
    const doc = this.messagesContainer.ownerDocument;
    if (!item) {
      const empty = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      empty.className = "zai-empty";
      empty.textContent = "Select a paper to start";
      this.messagesContainer.appendChild(empty);
      return;
    }
    
    // Clear messages and load new conversation
    this.messagesContainer.appendChild(this.buildWelcomeMessage(doc, "Ask me anything about this paper!"));
    this.loadConversation();
  },
  
  /**
   * Clean up
   */
  destroy() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.container = null;
    this.messagesContainer = null;
    this.inputArea = null;
    this.sendButton = null;
  }
};
