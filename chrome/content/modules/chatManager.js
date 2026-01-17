/**
 * Chat Manager
 * 
 * Manages conversation state and message handling
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.ChatManager = {
  // Conversation history per item
  conversations: new Map(),
  conversationIds: new Map(),
  
  // Current conversation
  currentItemId: null,
  currentMessages: [],
  
  // Default system prompt for academic paper assistance
  DEFAULT_SYSTEM_PROMPT: `You are an AI research assistant helping a user read and understand academic papers. You have access to the paper's metadata and can see text the user selects.

Your role is to:
- Explain complex concepts in clear, accessible language
- Summarize sections or the entire paper when asked
- Answer questions about methodology, results, and conclusions
- Help identify key findings and their implications
- Suggest related concepts or papers when relevant
- Analyze images attached by the user (figures, tables, diagrams) when provided

Always be accurate and cite specific parts of the paper when relevant. If you're unsure about something, say so. Keep responses concise but thorough.`,

  getDefaultProvider() {
    return Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultProvider", true) || "copilot";
  },

  getDefaultModel(provider) {
    const stored = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true);
    if (stored) return stored;
    if (provider === "copilot" && ZoteroAIAssistant.ModelRegistry?.getDefaultModel) {
      return ZoteroAIAssistant.ModelRegistry.getDefaultModel("copilot")?.id || null;
    }
    return null;
  },

  normalizeTaskId(taskId) {
    if (!taskId) return null;
    const normalized = String(taskId).toLowerCase();
    const map = {
      summarize: "summarize",
      keypoints: "keypoints",
      keyfindings: "keypoints",
      findings: "findings",
      methods: "methods",
      methodology: "methods",
      compare: "compare",
      translate: "translate",
      explain: "explain",
      define: "define",
      paraphrase: "paraphrase"
    };
    return map[normalized] || null;
  },

  getTaskModel(taskId, provider) {
    const normalized = this.normalizeTaskId(taskId);
    if (!normalized) return null;
    const model = Zotero.Prefs.get(`extensions.zotero-ai-assistant.taskModel.${normalized}`, true);
    if (!model) return null;
    if (provider === "copilot" && ZoteroAIAssistant.ModelRegistry?.getModel) {
      const resolved = ZoteroAIAssistant.ModelRegistry.getModel("copilot", model);
      if (!resolved) return null;
    }
    return model;
  },

  getModelSettings(options = {}) {
    const provider = options.providerOverride || this.getDefaultProvider();
    const task = options.task || options.action || null;
    const taskModel = this.getTaskModel(task, provider);
    const defaultModel = this.getDefaultModel(provider) || "grok-code-fast-1";
    const modelId = options.modelOverride || taskModel || defaultModel;
    return { provider, modelId };
  },
  
  /**
   * Get or create conversation for an item
   */
  getConversation(itemId) {
    if (!this.conversations.has(itemId)) {
      this.conversations.set(itemId, []);
    }
    return this.conversations.get(itemId);
  },
  
  /**
   * Set the current item context
   */
  setCurrentItem(item) {
    if (!item) {
      this.currentItemId = null;
      this.currentMessages = [];
      this.currentConversationId = null;
      return;
    }
    
    const itemId = item.id;
    this.currentItemId = itemId;
    this.currentMessages = this.getConversation(itemId);
    this.currentConversationId = this.conversationIds.get(itemId) || null;
    
    // Add paper context if starting fresh
    if (this.currentMessages.length === 0) {
      const metadata = ZoteroAIAssistant.PDFReader.getItemMetadata(item);
      if (metadata) {
        this.addPaperContext(metadata);
      }
    }
  },
  
  /**
   * Add paper context to the conversation
   */
  addPaperContext(metadata) {
    const contextMessage = this.formatPaperContext(metadata);
    
    // Add as a system message
    this.currentMessages.push({
      role: "system",
      content: contextMessage
    });
  },
  
  /**
   * Format paper metadata for context
   */
  formatPaperContext(metadata) {
    let context = `The user is reading the following paper:\n\n`;
    context += `Title: ${metadata.title || "Unknown"}\n`;
    
    if (metadata.authors && metadata.authors.length > 0) {
      context += `Authors: ${metadata.authors.join(", ")}\n`;
    }
    
    if (metadata.date) {
      context += `Date: ${metadata.date}\n`;
    }
    
    if (metadata.publicationTitle) {
      context += `Publication: ${metadata.publicationTitle}\n`;
    }
    
    if (metadata.abstract) {
      context += `\nAbstract:\n${metadata.abstract}\n`;
    }
    
    return context;
  },
  
  /**
   * Send a message and get AI response
   * @param {string} content - User message
   * @param {object} options - Additional options
   * @param {function} options.onChunk - Streaming callback
   * @param {string} options.selectedText - Selected text context
   * @param {AbortSignal} options.signal - Abort signal
   */
  async sendMessage(content, options = {}) {
    const { onChunk, selectedText, signal, item, images } = options;
    
    // Set context if item provided
    if (item) {
      this.setCurrentItem(item);
    }

    await this.ensureConversationLoaded(item);
    
    // Build messages array
    const messages = this.buildMessagesForRequest(content, selectedText, images);
    
    // Add user message to history
    const userMessage = {
      role: "user",
      content: selectedText ? `[Selected text: "${selectedText}"]\n\n${content}` : content,
      timestamp: Date.now()
    };
    
    if (images && images.length) {
      userMessage.images = images;
    }
    
    this.currentMessages.push(userMessage);
    
    const { provider, modelId } = this.getModelSettings(options);
    
    try {
      let response;
      
      if (provider === "ollama" || provider === "lmstudio") {
        // Use LocalModelClient for local providers
        response = await ZoteroAIAssistant.LocalModelClient.chat({
          provider,
          model: modelId,
          messages,
          stream: !!onChunk,
          onChunk,
          signal
        });
      } else {
        // Use CopilotClient for Copilot
        response = await ZoteroAIAssistant.CopilotClient.chat({
          model: modelId,
          messages,
          stream: !!onChunk,
          onChunk,
          signal
        });
      }
      
      // Add assistant response to history
      const assistantContent = response.content || response.choices?.[0]?.message?.content;
      this.currentMessages.push({
        role: "assistant",
        content: assistantContent,
        timestamp: Date.now(),
        model: modelId
      });
      
      // Persist conversation
      this.saveConversation();
      
      return {
        success: true,
        content: assistantContent,
        model: modelId
      };
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.ChatManager: Error sending message: " + error);
      
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Build messages array for API request
   */
  buildMessagesForRequest(userContent, selectedText, images = []) {
    const messages = [];
    
    // Add system prompt
    const customPrompt = Zotero.Prefs.get("extensions.zotero-ai-assistant.customSystemPrompt", true);
    messages.push({
      role: "system",
      content: customPrompt || this.DEFAULT_SYSTEM_PROMPT
    });
    
    // Add paper context if available
    const contextMsg = this.currentMessages.find(m => m.role === "system" && m.content.includes("reading the following paper"));
    if (contextMsg) {
      messages.push(contextMsg);
    }
    
    // Add recent conversation history (last 10 exchanges)
    const history = this.currentMessages
      .filter(m => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map(m => ({
        role: m.role,
        content: m.content,
        images: m.images
      }));
    
    messages.push(...history);
    
    // Add current user message
    let content = userContent;
    if (selectedText) {
      content = `[The user has selected the following text from the paper:]\n"${selectedText}"\n\n${userContent}`;
    }
    
    const userMessage = {
      role: "user",
      content
    };
    
    if (images && images.length) {
      userMessage.images = images;
    }
    
    messages.push(userMessage);
    
    return messages;
  },
  
  /**
   * Clear conversation for current item
   */
  async clearConversation() {
    const itemId = this.currentItemId;
    if (!itemId) return false;

    this.conversations.delete(itemId);
    this.currentMessages = [];
    this.currentConversationId = null;
    this.conversationIds.delete(itemId);

    try {
      await ZoteroAIAssistant.ConversationStorage?.clearConversations(itemId);
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.ChatManager: Clear error: " + error);
    }

    return true;
  },
  
  // Current conversation ID for updates
  currentConversationId: null,
  
  /**
   * Save conversation to storage
   */
  async saveConversation() {
    // Only save if enabled in preferences
    const saveHistory = Zotero.Prefs.get("extensions.zotero-ai-assistant.saveConversationHistory", true);
    if (!saveHistory || !this.currentItemId) return;
    
    const messages = this.currentMessages.filter(m => m.role !== "system" || m.content.includes("reading the following paper"));
    
    if (messages.length === 0) return;
    
    try {
      let updated = false;
      if (this.currentConversationId) {
        // Update existing conversation
        updated = await ZoteroAIAssistant.ConversationStorage.updateConversation(
          this.currentItemId,
          this.currentConversationId,
          messages
        );
      }

      if (!updated) {
        // Create new conversation
        this.currentConversationId = await ZoteroAIAssistant.ConversationStorage.saveConversation(
          this.currentItemId,
          messages
        );
      }

      if (this.currentConversationId) {
        this.conversationIds.set(this.currentItemId, this.currentConversationId);
      }
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.ChatManager: Save error: " + error);
    }
  },
  
  /**
   * Load a specific conversation from storage
   */
  async loadConversation(itemId, conversationId) {
    if (!itemId || !conversationId) return false;
    
    try {
      const conversation = await ZoteroAIAssistant.ConversationStorage.getConversation(itemId, conversationId);
      if (!conversation) return false;
      
      this.currentItemId = itemId;
      this.currentConversationId = conversationId;
      this.currentMessages = conversation.messages || [];
      this.conversations.set(itemId, this.currentMessages);
      this.conversationIds.set(itemId, conversationId);
      
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.ChatManager: Load error: " + error);
      return false;
    }
  },
  
  /**
   * Get all saved conversations for an item
   */
  async getSavedConversations(itemId) {
    return await ZoteroAIAssistant.ConversationStorage.getConversations(itemId);
  },
  
  /**
   * Start a new conversation for current item
   */
  startNewConversation() {
    this.currentConversationId = null;
    this.currentMessages = [];
    if (this.currentItemId) {
      this.conversations.set(this.currentItemId, []);
      this.conversationIds.delete(this.currentItemId);
    }
  },
  
  /**
   * Delete a saved conversation
   */
  async deleteConversation(itemId, conversationId) {
    if (this.conversationIds.get(itemId) === conversationId) {
      this.conversationIds.delete(itemId);
      if (this.currentItemId === itemId) {
        this.currentConversationId = null;
      }
    }
    return await ZoteroAIAssistant.ConversationStorage.deleteConversation(itemId, conversationId);
  },

  getLatestConversation(conversations) {
    if (!Array.isArray(conversations) || conversations.length === 0) return null;
    return [...conversations].sort((a, b) => {
      const aTime = Date.parse(a.updatedAt || a.createdAt || 0) || 0;
      const bTime = Date.parse(b.updatedAt || b.createdAt || 0) || 0;
      return bTime - aTime;
    })[0];
  },

  async ensureConversationLoaded(item) {
    const itemId = item?.id || this.currentItemId;
    if (!itemId) return false;

    const saveHistory = Zotero.Prefs.get("extensions.zotero-ai-assistant.saveConversationHistory", true);
    if (!saveHistory || !ZoteroAIAssistant.ConversationStorage) return false;

    const existing = this.conversations.get(itemId) || [];
    const hasNonSystem = existing.some(m => m.role === "user" || m.role === "assistant");
    if (hasNonSystem && this.conversationIds.get(itemId)) {
      return false;
    }

    try {
      const conversations = await ZoteroAIAssistant.ConversationStorage.getConversations(itemId);
      if (!conversations.length) return false;

      const latest = this.getLatestConversation(conversations);
      if (!latest || !latest.messages || latest.messages.length === 0) return false;

      this.conversations.set(itemId, latest.messages);
      this.currentItemId = itemId;
      this.currentConversationId = latest.id || null;
      this.currentMessages = latest.messages;
      if (latest.id) {
        this.conversationIds.set(itemId, latest.id);
      }
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.ChatManager: Load latest error: " + error);
      return false;
    }
  },
  
  /**
   * Export conversation to Zotero note
   */
  async exportToNote(itemId, conversationId) {
    return await ZoteroAIAssistant.ConversationStorage.exportToNote(itemId, conversationId);
  },
  
  /**
   * Get conversation history for display
   */
  getDisplayMessages() {
    return this.currentMessages
      .filter(m => m.role !== "system" || m.content.includes("reading the following paper"))
      .map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        model: m.model,
        images: m.images
      }));
  }
};
