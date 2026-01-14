/**
 * Batch Processor Module
 * 
 * Processes multiple papers with progress tracking.
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.BatchProcessor = {
  // Processing state
  isProcessing: false,
  currentProgress: 0,
  totalItems: 0,
  abortController: null,
  
  /**
   * Available batch actions
   */
  BATCH_ACTIONS: [
    { id: "summarize", name: "Summarize All", prompt: "Provide a brief summary of this paper (2-3 sentences)." },
    { id: "keywords", name: "Extract Keywords", prompt: "List 5-10 key terms or concepts from this paper." },
    { id: "methodology", name: "Extract Methods", prompt: "Briefly describe the methodology used in this paper." },
    { id: "findings", name: "Extract Findings", prompt: "List the main findings of this paper." },
    { id: "generateNotes", name: "Generate Notes", prompt: null } // Special handling
  ],
  
  /**
   * Process multiple items with a given action
   * @param {Array<Zotero.Item>} items - Items to process
   * @param {string} action - Action to perform
   * @param {function} onProgress - Progress callback (current, total, item, result)
   * @param {function} onComplete - Completion callback (results)
   */
  async processItems(items, action, onProgress, onComplete) {
    if (this.isProcessing) {
      return { success: false, message: "A batch process is already running." };
    }
    
    if (!items || items.length === 0) {
      return { success: false, message: "No items to process." };
    }
    
    this.isProcessing = true;
    this.currentProgress = 0;
    this.totalItems = items.length;
    const view = typeof window !== "undefined" ? window : null;
    const AbortControllerCtor = view?.AbortController || (typeof AbortController !== "undefined" ? AbortController : null);
    this.abortController = AbortControllerCtor ? new AbortControllerCtor() : null;
    
    const results = [];
    const actionConfig = this.BATCH_ACTIONS.find(a => a.id === action);
    
    if (!actionConfig) {
      this.isProcessing = false;
      return { success: false, message: "Unknown action: " + action };
    }
    
    try {
      for (let i = 0; i < items.length; i++) {
        if (this.abortController?.signal?.aborted) {
          break;
        }
        
        const item = items[i];
        const title = item.getField?.("title") || "Unknown";
        
        this.currentProgress = i + 1;
        
        let result;
        try {
          if (action === "generateNotes") {
            result = await this.generateNotesForItem(item);
          } else {
            result = await this.processItem(item, actionConfig.prompt);
          }
        } catch (error) {
          result = { error: error.message };
        }
        
        results.push({
          itemID: item.id,
          title,
          result
        });
        
        // Call progress callback
        if (onProgress) {
          onProgress(i + 1, items.length, item, result);
        }
        
        // Small delay to prevent rate limiting
        if (i < items.length - 1) {
          await this.delay(500);
        }
      }
      
      this.isProcessing = false;
      
      if (onComplete) {
        onComplete(results);
      }
      
      return {
        success: true,
        processed: results.length,
        aborted: this.abortController?.signal?.aborted || false,
        results
      };
    } catch (error) {
      this.isProcessing = false;
      Zotero.debug("ZoteroAIAssistant.BatchProcessor: Error: " + error);
      return { success: false, message: error.message, results };
    }
  },
  
  /**
   * Process a single item
   */
  async processItem(item, prompt) {
    const title = item.getField?.("title") || "";
    const abstract = item.getField?.("abstractNote") || "";
    
    const fullPrompt = `Paper: ${title}\n\nAbstract: ${abstract || "(No abstract available)"}\n\n${prompt}`;
    
    const model = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "grok-code-fast-1";
    
    const response = await ZoteroAIAssistant.CopilotClient.chat({
      model,
      messages: [
        {
          role: "system",
          content: "You are an academic research assistant. Provide concise, accurate responses about scientific papers."
        },
        {
          role: "user",
          content: fullPrompt
        }
      ],
      stream: false,
      signal: this.abortController?.signal
    });
    
    return response.content || response.choices?.[0]?.message?.content || "";
  },
  
  /**
   * Generate notes for an item
   */
  async generateNotesForItem(item) {
    if (!ZoteroAIAssistant.NotesManager) {
      return { error: "Notes manager not available" };
    }
    
    const result = await ZoteroAIAssistant.NotesManager.createNotesFromTemplate(item);
    return result;
  },
  
  /**
   * Abort current batch process
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isProcessing = false;
  },
  
  /**
   * Get current progress
   */
  getProgress() {
    return {
      isProcessing: this.isProcessing,
      current: this.currentProgress,
      total: this.totalItems,
      percentage: this.totalItems > 0 ? Math.round((this.currentProgress / this.totalItems) * 100) : 0
    };
  },
  
  /**
   * Process selected items in Zotero
   */
  async processSelected(action, onProgress, onComplete) {
    const zoteroPane = Zotero.getActiveZoteroPane();
    if (!zoteroPane) {
      return { success: false, message: "No active Zotero pane." };
    }
    
    const selectedItems = zoteroPane.getSelectedItems();
    // Filter to regular items only
    const regularItems = selectedItems.filter(item => 
      item.isRegularItem?.() || 
      item.itemType === "journalArticle" || 
      item.itemType === "conferencePaper" || 
      item.itemType === "book"
    );
    
    if (regularItems.length === 0) {
      return { success: false, message: "No papers selected." };
    }
    
    return await this.processItems(regularItems, action, onProgress, onComplete);
  },
  
  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Export batch results
   */
  exportResults(results, format = "markdown") {
    if (!results || results.length === 0) return "";
    
    if (format === "markdown") {
      let md = "# Batch Processing Results\n\n";
      md += `Processed ${results.length} papers on ${new Date().toLocaleString()}\n\n`;
      md += "---\n\n";
      
      for (const item of results) {
        md += `## ${item.title}\n\n`;
        if (item.result?.error) {
          md += `**Error:** ${item.result.error}\n\n`;
        } else if (typeof item.result === "string") {
          md += `${item.result}\n\n`;
        } else if (item.result?.message) {
          md += `${item.result.message}\n\n`;
        }
        md += "---\n\n";
      }
      
      return md;
    }
    
    // CSV format
    let csv = "Title,Result\n";
    for (const item of results) {
      const result = item.result?.error || item.result?.message || item.result || "";
      const cleanResult = result.toString().replace(/"/g, '""').replace(/\n/g, " ");
      csv += `"${item.title}","${cleanResult}"\n`;
    }
    
    return csv;
  },
  
  /**
   * Copy results to clipboard
   */
  copyResults(results) {
    const markdown = this.exportResults(results, "markdown");
    
    try {
      const clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Components.interfaces.nsIClipboardHelper);
      clipboardHelper.copyString(markdown);
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.BatchProcessor: Copy error: " + error);
      return false;
    }
  }
};
