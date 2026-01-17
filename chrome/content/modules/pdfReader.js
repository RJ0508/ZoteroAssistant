/**
 * PDF Reader Integration
 * 
 * Integrates with Zotero's PDF reader to:
 * - Extract selected text
 * - Get current page text
 * - Access paper metadata
 * - Add context menu items
 * - Provide AI actions on text selection
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.PDFReader = {
  // Plugin ID for event registration
  pluginID: "zotero-ai-assistant@jiayingqi.outlook.com",
  
  // Registered event handlers
  registeredHandlers: [],
  
  // Available selection actions
  SELECTION_ACTIONS: [
    { id: "translate", label: "Translate" },
    { id: "explain", label: "Explain" },
    { id: "define", label: "Define" },
    { id: "summarize", label: "Summarize" },
    { id: "paraphrase", label: "Paraphrase" }
  ],
  
  // Supported languages for translation
  LANGUAGES: [
    { code: "en", name: "English" },
    { code: "zh", name: "Chinese (中文)" },
    { code: "es", name: "Spanish (Español)" },
    { code: "fr", name: "French (Français)" },
    { code: "de", name: "German (Deutsch)" },
    { code: "ja", name: "Japanese (日本語)" },
    { code: "ko", name: "Korean (한국어)" },
    { code: "pt", name: "Portuguese (Português)" },
    { code: "ru", name: "Russian (Русский)" },
    { code: "ar", name: "Arabic (العربية)" }
  ],
  
  /**
   * Initialize PDF reader integration
   */
  init() {
    Zotero.debug("ZoteroAIAssistant.PDFReader: Starting initialization...");
    
    // Check if Zotero.Reader exists
    if (!Zotero.Reader) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: Zotero.Reader not available");
      return;
    }
    
    Zotero.debug("ZoteroAIAssistant.PDFReader: Zotero.Reader available");
    
    this.registerTextSelectionHandler();
    this.registerContextMenuHandler();
    
    Zotero.debug("ZoteroAIAssistant.PDFReader: Initialization complete");
  },
  
  /**
   * Register handler for text selection popup
   */
  registerTextSelectionHandler() {
    const self = this;
    const handler = (event) => {
      const { reader, doc, params, append } = event;
      const selectedText = params.annotation?.text;
      
      if (!selectedText || selectedText.trim().length < 2) return;
      
      // Remove any existing AI toolbar
      const existing = doc.querySelector(".zai-selection-toolbar");
      if (existing) existing.remove();
      
      // Create AI actions toolbar as a separate floating element
      const container = doc.createElement("div");
      container.className = "zai-selection-toolbar";
      container.id = "zai-floating-toolbar";
      
      // Build action buttons in 2-column rows
      const actions = self.SELECTION_ACTIONS;
      let buttonsHTML = '';
      for (let i = 0; i < actions.length; i += 2) {
        buttonsHTML += '<div class="zai-sel-row">';
        buttonsHTML += `<button class="zai-sel-btn" data-action="${actions[i].id}">${actions[i].label}</button>`;
        if (actions[i + 1]) {
          buttonsHTML += `<button class="zai-sel-btn" data-action="${actions[i + 1].id}">${actions[i + 1].label}</button>`;
        }
        buttonsHTML += '</div>';
      }
      
      container.innerHTML = `
        <div class="zai-sel-header">
          <span class="zai-sel-title">AI Assistant</span>
        </div>
        <div class="zai-sel-actions">
          ${buttonsHTML}
        </div>
      `;
      
      // Add styles inline (for PDF reader iframe) - Separate floating toolbar
      const style = doc.createElement("style");
      style.textContent = `
        .zai-selection-toolbar {
          position: fixed;
          z-index: 99999;
          width: 240px;
          padding: 12px 12px 10px;
          border-radius: 12px;
          background: linear-gradient(180deg, #f8fafc 0%, #ffffff 60%);
          border: 1px solid #e2e8f0;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
          color: #0f172a;
          font-family: "Avenir Next", "Avenir", "Helvetica Neue", "Noto Sans", sans-serif;
          letter-spacing: 0.01em;
          --zai-sel-accent: #0d9488;
          --zai-sel-accent-dark: #0f766e;
          --zai-sel-muted: #64748b;
          --zai-sel-border: #e2e8f0;
          --zai-sel-surface: #f8fafc;
        }
        .zai-selection-toolbar * {
          box-sizing: border-box;
          font-family: inherit;
        }
        .zai-sel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 8px;
          margin-bottom: 10px;
          border-bottom: 1px solid var(--zai-sel-border);
        }
        .zai-sel-title,
        .zai-sel-loading {
          font-size: 12px;
          font-weight: 700;
          color: #0f172a;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .zai-sel-title::before,
        .zai-sel-loading::before {
          content: "";
          width: 6px;
          height: 6px;
          border-radius: 999px;
          background: var(--zai-sel-accent);
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.18);
        }
        .zai-sel-loading {
          color: var(--zai-sel-muted);
          font-weight: 600;
        }
        .zai-sel-actions {
          width: 100%;
        }
        .zai-sel-row {
          display: flex;
          gap: 8px;
          margin-bottom: 8px;
          width: 100%;
        }
        .zai-sel-row:last-child {
          margin-bottom: 0;
        }
        .zai-sel-btn {
          flex: 1;
          padding: 8px 0;
          background: #ffffff;
          border: 1px solid var(--zai-sel-border);
          border-radius: 8px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
          color: #1f2937;
          text-align: center;
          transition: transform 0.12s ease, box-shadow 0.12s ease, color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
        }
        .zai-sel-btn:hover {
          background: var(--zai-sel-accent);
          border-color: var(--zai-sel-accent);
          color: #fff;
          transform: translateY(-1px);
          box-shadow: 0 8px 16px rgba(13, 148, 136, 0.2);
        }
        .zai-sel-btn:active {
          transform: translateY(0);
          box-shadow: none;
        }
        .zai-sel-result {
          margin-top: 10px;
          text-align: left;
        }
        .zai-sel-result-text {
          background: var(--zai-sel-surface);
          border: 1px solid var(--zai-sel-border);
          border-radius: 8px;
          padding: 10px;
          font-size: 12px;
          line-height: 1.6;
          color: #111827;
          max-height: 200px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-wrap: break-word;
          -moz-user-select: text;
          user-select: text;
        }
        .zai-sel-result-actions {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 6px;
          margin-top: 8px;
        }
        .zai-sel-copy-btn,
        .zai-sel-back-btn,
        .zai-sel-annotate-btn {
          padding: 6px 0;
          border-radius: 7px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          text-align: center;
          border: 1px solid var(--zai-sel-border);
          background: #fff;
          color: #1f2937;
          white-space: nowrap;
          transition: transform 0.12s ease, box-shadow 0.12s ease, color 0.12s ease, border-color 0.12s ease, background 0.12s ease;
        }
        .zai-sel-copy-btn {
          background: var(--zai-sel-accent);
          border-color: var(--zai-sel-accent-dark);
          color: #fff;
        }
        .zai-sel-copy-btn:hover {
          background: var(--zai-sel-accent-dark);
          border-color: var(--zai-sel-accent-dark);
          box-shadow: 0 6px 14px rgba(13, 148, 136, 0.25);
        }
        .zai-sel-annotate-btn:hover {
          background: var(--zai-sel-accent);
          border-color: var(--zai-sel-accent);
          color: #fff;
        }
        .zai-sel-back-btn {
          background: #f1f5f9;
          color: var(--zai-sel-muted);
          border-style: dashed;
        }
        .zai-sel-back-btn:hover {
          background: #e2e8f0;
          color: #334155;
        }
      `;
      container.prepend(style);
      
      // Add click handlers
      container.querySelectorAll(".zai-sel-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const action = btn.dataset.action;
          
          // Show loading state in the popup itself
          const actionsDiv = container.querySelector(".zai-sel-actions");
          const headerDiv = container.querySelector(".zai-sel-header");
          
          // Create result container
          let resultDiv = container.querySelector(".zai-sel-result");
          if (!resultDiv) {
            resultDiv = doc.createElement("div");
            resultDiv.className = "zai-sel-result";
            container.appendChild(resultDiv);
          }
          
          // Show loading
          actionsDiv.style.display = "none";
          headerDiv.innerHTML = `<span class="zai-sel-loading">Processing...</span>`;
          resultDiv.innerHTML = "";
          
          // Get the result inline
          const result = await self.executeAction(action, selectedText.trim(), reader);
          
          // Show result
          headerDiv.innerHTML = `<span class="zai-sel-title">${self.getActionTitle(action)}</span>`;
          resultDiv.innerHTML = `
            <div class="zai-sel-result-text">${self.renderMarkdown(result)}</div>
            <div class="zai-sel-result-actions">
              <button class="zai-sel-copy-btn">Copy</button>
              <button class="zai-sel-annotate-btn">Save Note</button>
              <button class="zai-sel-back-btn">Back</button>
            </div>
          `;
          
          // Copy button
          resultDiv.querySelector(".zai-sel-copy-btn")?.addEventListener("click", () => {
            const clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
              .getService(Components.interfaces.nsIClipboardHelper);
            clipboardHelper.copyString(result);
            resultDiv.querySelector(".zai-sel-copy-btn").textContent = "Copied!";
          });
          
          // Save as annotation button
          resultDiv.querySelector(".zai-sel-annotate-btn")?.addEventListener("click", async () => {
            const btn = resultDiv.querySelector(".zai-sel-annotate-btn");
            btn.textContent = "Saving...";
            try {
              const item = self.getItemFromReader(reader);
              const mainWindow = Zotero.getMainWindow();
              const ZAI = mainWindow?.ZoteroAIAssistant;
              if (item && ZAI?.AnnotationManager) {
                await ZAI.AnnotationManager.saveAsAnnotation({
                  itemID: item.id,
                  selectedText: selectedText.trim(),
                  response: result,
                  actionType: action
                });
                btn.textContent = "Saved!";
              } else {
                btn.textContent = "Error";
              }
            } catch (e) {
              Zotero.debug("Save annotation error: " + e);
              btn.textContent = "Error";
            }
          });
          
          // Back button - rebuild the original layout
          resultDiv.querySelector(".zai-sel-back-btn")?.addEventListener("click", () => {
            // Rebuild buttons in 2-column rows
            const actions = self.SELECTION_ACTIONS;
            let btnsHTML = '';
            for (let i = 0; i < actions.length; i += 2) {
              btnsHTML += '<div class="zai-sel-row">';
              btnsHTML += `<button class="zai-sel-btn" data-action="${actions[i].id}">${actions[i].label}</button>`;
              if (actions[i + 1]) {
                btnsHTML += `<button class="zai-sel-btn" data-action="${actions[i + 1].id}">${actions[i + 1].label}</button>`;
              }
              btnsHTML += '</div>';
            }
            actionsDiv.innerHTML = btnsHTML;
            actionsDiv.style.display = "inline-block";
            headerDiv.innerHTML = `<span class="zai-sel-title">AI Assistant</span>`;
            resultDiv.innerHTML = "";
            
            // Re-attach click handlers
            actionsDiv.querySelectorAll(".zai-sel-btn").forEach(btn => {
              btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const action = btn.dataset.action;
                actionsDiv.style.display = "none";
                headerDiv.innerHTML = `<span class="zai-sel-loading">Processing...</span>`;
                const result = await self.executeAction(action, selectedText.trim(), reader);
                headerDiv.innerHTML = `<span class="zai-sel-title">${self.getActionTitle(action)}</span>`;
                resultDiv.innerHTML = `
                  <div class="zai-sel-result-text">${self.renderMarkdown(result)}</div>
                  <div class="zai-sel-result-actions">
                    <button class="zai-sel-copy-btn">Copy</button>
                    <button class="zai-sel-annotate-btn">Save Note</button>
                    <button class="zai-sel-back-btn">Back</button>
                  </div>
                `;
                // Re-attach copy and back handlers (recursive)
                resultDiv.querySelector(".zai-sel-copy-btn")?.addEventListener("click", () => {
                  const clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                    .getService(Components.interfaces.nsIClipboardHelper);
                  clipboardHelper.copyString(result);
                  resultDiv.querySelector(".zai-sel-copy-btn").textContent = "Copied!";
                });
                // Re-attach annotate handler
                resultDiv.querySelector(".zai-sel-annotate-btn")?.addEventListener("click", async () => {
                  const btn = resultDiv.querySelector(".zai-sel-annotate-btn");
                  btn.textContent = "Saving...";
                  try {
                    const item = self.getItemFromReader(reader);
                    const mainWindow = Zotero.getMainWindow();
                    const ZAI = mainWindow?.ZoteroAIAssistant;
                    if (item && ZAI?.AnnotationManager) {
                      await ZAI.AnnotationManager.saveAsAnnotation({
                        itemID: item.id,
                        selectedText: selectedText.trim(),
                        response: result,
                        actionType: action
                      });
                      btn.textContent = "Saved!";
                    } else {
                      btn.textContent = "Error";
                    }
                  } catch (e) {
                    btn.textContent = "Error";
                  }
                });
              });
            });
          });
        });
      });
      
      // Position our toolbar below Zotero's popup, center-aligned
      // First append to get the Zotero popup position
      append(container);
      
      // After a short delay, reposition as separate floating element
      setTimeout(() => {
        const zoteroPopup = container.closest('[class*="popup"], [class*="Popup"], .annotation-popup');
        if (zoteroPopup) {
          // Function to update position
          const updatePosition = () => {
            if (!doc.body.contains(container)) return;
            const rect = zoteroPopup.getBoundingClientRect();
            const toolbarWidth = container.getBoundingClientRect().width || 240;
            const centerX = rect.left + (rect.width / 2) - (toolbarWidth / 2);
            container.style.left = centerX + "px";
            container.style.top = (rect.bottom + 8) + "px";
          };
          
          // Initial position
          container.style.position = 'fixed';
          container.style.zIndex = '99999';
          updatePosition();
          doc.body.appendChild(container);
          
          // Keep updating position to follow Zotero popup
          const positionInterval = setInterval(updatePosition, 50);
          
          // Poll to check if Zotero popup still exists
          const checkInterval = setInterval(() => {
            const view = doc.defaultView;
            const style = view?.getComputedStyle ? view.getComputedStyle(zoteroPopup) : null;
            const hiddenByStyle = style ? (style.display === "none" || style.visibility === "hidden") : false;
            const popupGone = !doc.body.contains(zoteroPopup) || 
                              zoteroPopup.offsetParent === null ||
                              hiddenByStyle;
            if (popupGone) {
              container.remove();
              clearInterval(checkInterval);
              clearInterval(positionInterval);
            }
          }, 100);
          
          // Also remove on click outside
          const clickHandler = (e) => {
            if (!container.contains(e.target)) {
              container.remove();
              doc.removeEventListener('mousedown', clickHandler, true);
              clearInterval(checkInterval);
              clearInterval(positionInterval);
            }
          };
          setTimeout(() => {
            doc.addEventListener('mousedown', clickHandler, true);
          }, 200);
          
          // Clean up after 60 seconds max (longer for reading results)
          setTimeout(() => {
            if (doc.body.contains(container)) {
              container.remove();
            }
            clearInterval(checkInterval);
            clearInterval(positionInterval);
            doc.removeEventListener('mousedown', clickHandler, true);
          }, 60000);
        }
      }, 50);
    };
    
    try {
      // Try the text selection popup event
      Zotero.Reader.registerEventListener("renderTextSelectionPopup", handler, this.pluginID);
      this.registeredHandlers.push({ type: "renderTextSelectionPopup", handler });
      Zotero.debug("ZoteroAIAssistant.PDFReader: Registered renderTextSelectionPopup handler");
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: Failed to register renderTextSelectionPopup: " + error);
      
      // Try alternative event names
      try {
        Zotero.Reader.registerEventListener("createTextSelectionPopup", handler, this.pluginID);
        this.registeredHandlers.push({ type: "createTextSelectionPopup", handler });
        Zotero.debug("ZoteroAIAssistant.PDFReader: Registered createTextSelectionPopup handler");
      } catch (e2) {
        Zotero.debug("ZoteroAIAssistant.PDFReader: Also failed createTextSelectionPopup: " + e2);
      }
    }
  },
  
  /**
   * Register context menu handler
   */
  registerContextMenuHandler() {
    const self = this;
    const handler = (event) => {
      const { reader, params, append } = event;
      const selectedText = params.annotation?.text;
      
      // Add separator
      append({ type: "separator" });
      
      // If text is selected, add text-specific actions
      if (selectedText && selectedText.trim().length > 0) {
        append({
          label: "Translate selection",
          onCommand: () => self.handleSelectionAction("translate", selectedText.trim(), reader)
        });
        
        append({
          label: "Explain selection",
          onCommand: () => self.handleSelectionAction("explain", selectedText.trim(), reader)
        });
        
        append({
          label: "Define terms",
          onCommand: () => self.handleSelectionAction("define", selectedText.trim(), reader)
        });
        
        append({ type: "separator" });
      }
      
      // General paper actions
      append({
        label: "Summarize this paper",
        onCommand: () => self.summarizePaper(reader)
      });
      
      append({
        label: "Extract key points",
        onCommand: () => self.extractKeyPoints(reader)
      });
      
      append({
        label: "Ask AI about this paper",
        onCommand: () => self.openAIAssistant(reader)
      });
    };
    
    try {
      Zotero.Reader.registerEventListener("createViewContextMenu", handler, this.pluginID);
      this.registeredHandlers.push({ type: "createViewContextMenu", handler });
      Zotero.debug("ZoteroAIAssistant.PDFReader: Registered createViewContextMenu handler");
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: Failed to register context menu: " + error);
      
      // Try alternative event name
      try {
        Zotero.Reader.registerEventListener("createAnnotationContextMenu", handler, this.pluginID);
        this.registeredHandlers.push({ type: "createAnnotationContextMenu", handler });
        Zotero.debug("ZoteroAIAssistant.PDFReader: Registered createAnnotationContextMenu handler");
      } catch (e2) {
        Zotero.debug("ZoteroAIAssistant.PDFReader: Also failed createAnnotationContextMenu: " + e2);
      }
    }
  },
  
  /**
   * Get action title for display
   */
  getActionTitle(action) {
    const titles = {
      translate: "Translation",
      explain: "Explanation", 
      define: "Definition",
      summarize: "Summary",
      paraphrase: "Paraphrase"
    };
    return titles[action] || action;
  },
  
  /**
   * Escape HTML for safe display
   */
  escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
      .replace(/\n/g, "<br/>");
  },
  
  /**
   * Render markdown to HTML
   */
  renderMarkdown(text) {
    if (!text) return "";
    
    let html = text
      // Escape HTML first
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      // Code blocks (must come before inline code)
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre style="background:#1f2937;color:#e5e7eb;padding:8px;border-radius:4px;overflow-x:auto;font-size:11px;"><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:11px;">$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Headers
      .replace(/^### (.+)$/gm, '<div style="font-weight:600;font-size:12px;margin:6px 0 3px;">$1</div>')
      .replace(/^## (.+)$/gm, '<div style="font-weight:700;font-size:13px;margin:8px 0 4px;">$1</div>')
      .replace(/^# (.+)$/gm, '<div style="font-weight:700;font-size:14px;margin:10px 0 5px;">$1</div>')
      // Numbered lists
      .replace(/^\d+\. (.+)$/gm, '<div style="margin-left:12px;">• $1</div>')
      // Bullet lists
      .replace(/^[-*] (.+)$/gm, '<div style="margin-left:12px;">• $1</div>')
      // Line breaks
      .replace(/\n/g, '<br/>');
    
    return html;
  },
  
  /**
   * Execute action and return result text directly
   */
  async executeAction(action, selectedText, reader) {
    try {
      // Get ZoteroAIAssistant
      const mainWindow = Zotero.getMainWindow();
      let ZAI = mainWindow?.ZoteroAIAssistant;
      if (!ZAI) {
        ZAI = typeof ZoteroAIAssistant !== 'undefined' ? ZoteroAIAssistant : null;
      }
      
      if (!ZAI || !ZAI.CopilotClient) {
        return "Error: AI Assistant not available. Please restart Zotero.";
      }
      
      // Build prompt
      const item = reader?.getItem?.() || this.getItemFromReader(reader);
      const paperTitle = item ? item.getField('title') : "";
      const paperContext = paperTitle ? `from the paper "${paperTitle}"` : "";
      
      const targetLang = Zotero.Prefs.get("extensions.zotero-ai-assistant.translateLanguage", true) || "zh";
      const langName = this.LANGUAGES.find(l => l.code === targetLang)?.name || "Chinese";
      
      let prompt;
      switch (action) {
        case "translate":
          prompt = `Translate the following text to ${langName}. Provide ONLY the translation, no explanations:\n\n"${selectedText}"`;
          break;
        case "explain":
          prompt = `Explain this text in simple terms ${paperContext}:\n\n"${selectedText}"`;
          break;
        case "define":
          prompt = `Define the key terms in this text ${paperContext}:\n\n"${selectedText}"`;
          break;
        case "summarize":
          prompt = `Summarize this text concisely:\n\n"${selectedText}"`;
          break;
        case "paraphrase":
          prompt = `Paraphrase this text in different words:\n\n"${selectedText}"`;
          break;
        default:
          return "Unknown action";
      }
      
      // Call the AI directly
      const model = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "grok-code-fast-1";
      
      Zotero.debug("ZoteroAIAssistant.PDFReader: Calling AI with prompt...");
      
      // Collect the response
      let fullContent = "";
      
      const response = await ZAI.CopilotClient.chat({
        model: model,
        messages: [
          { role: "user", content: prompt }
        ],
        stream: true,
        onChunk: (chunk) => {
          if (chunk.content) {
            fullContent += chunk.content;
          }
        }
      });
      
      // Return collected content or response content
      if (fullContent) {
        return fullContent;
      } else if (response && response.content) {
        return response.content;
      } else if (response && response.error) {
        return "Error: " + response.error;
      } else {
        return "No response from AI";
      }
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: executeAction error: " + error);
      return "Error: " + error.message;
    }
  },
  
  /**
   * Handle selection action (legacy, now used only for context menu)
   */
  handleSelectionAction(action, selectedText, reader) {
    Zotero.debug(`ZoteroAIAssistant.PDFReader: handleSelectionAction called - action: ${action}, text length: ${selectedText.length}`);
    
    // Get the main window to access ZoteroAIAssistant
    const mainWindow = Zotero.getMainWindow();
    if (!mainWindow) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: No main window found");
      Services.prompt.alert(null, "AI Assistant", "Could not find main window");
      return;
    }
    
    // Try to find ZoteroAIAssistant from different sources
    let ZAI = mainWindow.ZoteroAIAssistant;
    if (!ZAI) {
      // Try global
      ZAI = typeof ZoteroAIAssistant !== 'undefined' ? ZoteroAIAssistant : null;
    }
    
    if (!ZAI) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: ZoteroAIAssistant not found");
      Services.prompt.alert(null, "AI Assistant", "AI Assistant module not found. Please restart Zotero.");
      return;
    }
    
    const item = reader?.getItem?.() || this.getItemFromReader(reader);
    const paperTitle = item ? item.getField('title') : "";
    const paperContext = paperTitle ? `from the paper "${paperTitle}"` : "";
    
    // Get target language for translation
    const targetLang = Zotero.Prefs.get("extensions.zotero-ai-assistant.translateLanguage", true) || "zh";
    const langName = this.LANGUAGES.find(l => l.code === targetLang)?.name || targetLang;
    
    let prompt;
    
    switch (action) {
      case "translate":
        prompt = `Translate the following text ${paperContext} to ${langName}. Provide only the translation without any explanation:\n\n"${selectedText}"`;
        break;
        
      case "explain":
        prompt = `Explain the following text ${paperContext} in simple, clear terms. Make it accessible to someone who may not be an expert in this field:\n\n"${selectedText}"`;
        break;
        
      case "define":
        prompt = `Define and explain the key terms and concepts in the following text ${paperContext}. For each term, provide a clear definition:\n\n"${selectedText}"`;
        break;
        
      case "summarize":
        prompt = `Summarize the following text ${paperContext} concisely, capturing the main points:\n\n"${selectedText}"`;
        break;
        
      case "paraphrase":
        prompt = `Paraphrase the following text ${paperContext} in different words while maintaining the same meaning. Make it suitable for academic notes:\n\n"${selectedText}"`;
        break;
        
      default:
        Zotero.debug("ZoteroAIAssistant.PDFReader: Unknown action: " + action);
        return;
    }
    
    Zotero.debug("ZoteroAIAssistant.PDFReader: Prompt created, sending to assistant...");
    
    // Send message to the assistant (sidebar)
    this.sendToFloatingWindow(ZAI, prompt, item, selectedText, action);
  },
  
  /**
   * Send a message to the assistant (sidebar)
   */
  sendToFloatingWindow(ZAI, prompt, item, selectedText, action) {
    try {
      if (ZAI.toggleAssistant) {
        ZAI.toggleAssistant(true);
      }
      
      // Wait a bit for the UI to initialize, then send the message
      const mainWindow = Zotero.getMainWindow();
      mainWindow.setTimeout(async () => {
        try {
          if (ZAI.ChatManager && ZAI.ChatManager.sendMessage) {
            Zotero.debug("ZoteroAIAssistant.PDFReader: Sending message to ChatManager...");
            await ZAI.ChatManager.sendMessage(prompt, { 
              item, 
              selectedText,
              action 
            });
            Zotero.debug("ZoteroAIAssistant.PDFReader: Message sent successfully");
          } else {
            Zotero.debug("ZoteroAIAssistant.PDFReader: ChatManager.sendMessage not available");
            // Show a notification
            const ps = Services.prompt;
            ps.alert(null, "AI Assistant", "Chat Manager not ready. Please try again.");
          }
        } catch (error) {
          Zotero.debug("ZoteroAIAssistant.PDFReader: Failed to send message: " + error);
          Services.prompt.alert(null, "AI Assistant Error", "Failed to send message: " + error.message);
        }
      }, 200); // Wait for UI to initialize
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: sendToFloatingWindow error: " + error);
      Services.prompt.alert(null, "AI Assistant Error", "Error: " + error.message);
    }
  },
  
  /**
   * Extract key points from paper
   */
  extractKeyPoints(reader) {
    const mainWindow = Zotero.getMainWindow();
    const ZAI = mainWindow?.ZoteroAIAssistant;
    const item = reader.getItem?.() || this.getItemFromReader(reader);
    
    if (item && ZAI?.PaperActions?.keyPoints) {
      mainWindow.setTimeout(() => {
        ZAI.PaperActions.keyPoints(item);
      }, 0);
    }
  },
  
  /**
   * Open AI assistant for a paper
   */
  openAIAssistant(reader) {
    const mainWindow = Zotero.getMainWindow();
    const ZAI = mainWindow?.ZoteroAIAssistant;
    
    if (ZAI?.toggleAssistant) {
      mainWindow.setTimeout(() => {
        ZAI.toggleAssistant(true);
      }, 0);
    }
  },
  
  /**
   * Summarize a paper
   */
  summarizePaper(reader) {
    const mainWindow = Zotero.getMainWindow();
    const ZAI = mainWindow?.ZoteroAIAssistant;
    const item = reader.getItem?.() || this.getItemFromReader(reader);
    
    if (item && ZAI?.PaperActions?.summarize) {
      mainWindow.setTimeout(() => {
        ZAI.PaperActions.summarize(item);
      }, 0);
    }
  },
  
  /**
   * Get the Zotero item from a reader instance
   */
  getItemFromReader(reader) {
    try {
      // Try different methods to get the item
      if (reader._item) {
        return reader._item;
      }
      
      if (reader.itemID) {
        return Zotero.Items.get(reader.itemID);
      }
      
      // Get from the active tab
      const tab = Zotero.getActiveZoteroPane()?.getSelectedTab?.();
      if (tab?.type === "reader") {
        return Zotero.Items.get(tab.data.itemID);
      }
      
      return null;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: Failed to get item: " + error);
      return null;
    }
  },
  
  /**
   * Get the currently active reader
   */
  getActiveReader() {
    try {
      if (typeof Zotero?.Reader?.getActive === "function") {
        const active = Zotero.Reader.getActive();
        if (active) return active;
      }

      if (typeof Zotero?.Reader?.getActiveReader === "function") {
        const active = Zotero.Reader.getActiveReader();
        if (active) return active;
      }

      const win = Zotero.getMainWindow();
      const tabs = win?.Zotero_Tabs;
      
      if (!tabs) return null;
      
      const selectedTab = tabs.selectedIndex >= 0 ? tabs._tabs[tabs.selectedIndex] : null;
      
      if (selectedTab?.type === "reader") {
        return Zotero.Reader.getByTabID(selectedTab.id);
      }
      
      return null;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: Failed to get active reader: " + error);
      return null;
    }
  },
  
  /**
   * Get selected text from the active reader
   */
  getSelectedText() {
    const reader = this.getActiveReader();
    
    if (!reader) return null;
    
    try {
      const iframeWindow = reader._iframeWindow;
      if (iframeWindow) {
        return iframeWindow.getSelection()?.toString() || null;
      }
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: Failed to get selection: " + error);
    }
    
    return null;
  },

  /**
   * Capture current PDF page as an image
   */
  async captureCurrentPageImage(options = {}) {
    const reader = this.getActiveReader();
    if (!reader) {
      return { error: "No active PDF reader" };
    }

    const iframeWindow = reader._iframeWindow || reader._iframe?.contentWindow;
    const windowRef = iframeWindow?.wrappedJSObject || iframeWindow;
    const viewer = windowRef?.PDFViewerApplication;
    const pdfViewer = viewer?.pdfViewer;
    if (!pdfViewer) {
      return { error: "PDF viewer not available" };
    }

    const pageNumber = pdfViewer.currentPageNumber || 1;
    const pageView = pdfViewer.getPageView?.(pageNumber - 1) || pdfViewer._pages?.[pageNumber - 1];
    const canvas = pageView?.canvas
      || pageView?.canvasWrapper?.querySelector?.("canvas")
      || pageView?.div?.querySelector?.("canvas");
    if (!canvas || !canvas.width || !canvas.height) {
      return { error: "Page not rendered yet. Scroll to the page and try again." };
    }

    const {
      maxDimension = 1024,
      quality = 0.85,
      type = "image/jpeg"
    } = options;

    const scale = Math.min(maxDimension / canvas.width, maxDimension / canvas.height, 1);
    const targetW = Math.max(1, Math.round(canvas.width * scale));
    const targetH = Math.max(1, Math.round(canvas.height * scale));

    const doc = canvas.ownerDocument;
    const outputCanvas = doc.createElementNS("http://www.w3.org/1999/xhtml", "canvas");
    outputCanvas.width = targetW;
    outputCanvas.height = targetH;
    const ctx = outputCanvas.getContext("2d");
    if (!ctx) {
      return { error: "Canvas not available" };
    }
    ctx.drawImage(canvas, 0, 0, targetW, targetH);

    return {
      dataUrl: outputCanvas.toDataURL(type, quality),
      pageNumber,
      width: targetW,
      height: targetH
    };
  },
  
  /**
   * Get metadata from a Zotero item
   */
  getItemMetadata(item) {
    if (!item) return null;
    
    try {
      const creators = item.getCreators();
      const authors = creators
        .filter(c => c.creatorTypeID === Zotero.CreatorTypes.getID("author"))
        .map(c => c.firstName ? `${c.firstName} ${c.lastName}` : c.lastName);
      
      return {
        id: item.id,
        key: item.key,
        title: item.getField("title"),
        authors,
        abstract: item.getField("abstractNote"),
        date: item.getField("date"),
        publicationTitle: item.getField("publicationTitle"),
        DOI: item.getField("DOI"),
        url: item.getField("url"),
        itemType: item.itemType
      };
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: Failed to get metadata: " + error);
      return null;
    }
  },
  
  /**
   * Get the current item being viewed
   */
  getCurrentItem() {
    // Try to get from active reader
    const reader = this.getActiveReader();
    if (reader) {
      return reader.getItem?.() || this.getItemFromReader(reader);
    }
    
    // Fallback to selected item in library
    try {
      const items = Zotero.getActiveZoteroPane()?.getSelectedItems();
      if (items && items.length > 0) {
        return items[0];
      }
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.PDFReader: Failed to get current item: " + error);
    }
    
    return null;
  },
  
  /**
   * Cleanup - unregister event handlers
   */
  shutdown() {
    for (const { type, handler } of this.registeredHandlers) {
      try {
        Zotero.Reader.unregisterEventListener(type, handler);
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    this.registeredHandlers = [];
    Zotero.debug("ZoteroAIAssistant.PDFReader: Shutdown complete");
  }
};
