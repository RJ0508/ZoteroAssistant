/**
 * Export Helper Module
 * 
 * Provides export functionality for conversations and AI responses.
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.ExportHelper = {
  /**
   * Export conversation to Markdown format
   * @param {Array} messages - Array of message objects
   * @param {object} item - Zotero item for context
   * @returns {string} Markdown formatted conversation
   */
  toMarkdown(messages, item = null) {
    let md = "# AI Assistant Conversation\n\n";
    
    // Add paper context if available
    if (item) {
      md += `**Paper:** ${item.getField?.("title") || "Unknown"}\n`;
      const creators = item.getCreators?.();
      if (creators && creators.length > 0) {
        const authors = creators.map(c => `${c.firstName || ""} ${c.lastName || ""}`).join(", ");
        md += `**Authors:** ${authors}\n`;
      }
      md += `**Date:** ${new Date().toLocaleString()}\n\n`;
      md += "---\n\n";
    }
    
    // Format messages
    for (const msg of messages) {
      if (msg.role === "system") continue; // Skip system messages
      
      const role = msg.role === "user" ? "You" : "AI Assistant";
      const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : "";
      
      md += `## ${role}${timestamp ? ` (${timestamp})` : ""}\n\n`;
      md += `${msg.content}\n\n`;
    }
    
    return md;
  },
  
  /**
   * Export conversation to plain text
   * @param {Array} messages - Array of message objects
   * @returns {string} Plain text formatted conversation
   */
  toPlainText(messages) {
    let text = "AI Assistant Conversation\n";
    text += "=".repeat(40) + "\n\n";
    
    for (const msg of messages) {
      if (msg.role === "system") continue;
      
      const role = msg.role === "user" ? "You" : "AI";
      text += `${role}:\n${msg.content}\n\n`;
      text += "-".repeat(40) + "\n\n";
    }
    
    return text;
  },
  
  /**
   * Export conversation to HTML format
   * @param {Array} messages - Array of message objects
   * @returns {string} HTML formatted conversation
   */
  toHTML(messages) {
    let html = `<div class="zai-export-conversation">`;
    html += `<h1>AI Assistant Conversation</h1>`;
    html += `<p><em>Exported: ${new Date().toLocaleString()}</em></p>`;
    html += `<hr/>`;
    
    for (const msg of messages) {
      if (msg.role === "system") continue;
      
      const role = msg.role === "user" ? "You" : "AI Assistant";
      const content = this.markdownToHTML(msg.content);
      
      html += `<div class="zai-export-message zai-export-${msg.role}">`;
      html += `<p><strong>${role}:</strong></p>`;
      html += `<div>${content}</div>`;
      html += `</div><br/>`;
    }
    
    html += `</div>`;
    return html;
  },
  
  /**
   * Basic markdown to HTML conversion
   */
  markdownToHTML(text) {
    if (!text) return "";
    
    return text
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Line breaks
      .replace(/\n/g, '<br/>');
  },
  
  /**
   * Copy text to clipboard
   * @param {string} text - Text to copy
   */
  copyToClipboard(text) {
    try {
      const clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Components.interfaces.nsIClipboardHelper);
      clipboardHelper.copyString(text);
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.ExportHelper: Clipboard error: " + error);
      return false;
    }
  },
  
  /**
   * Export conversation to Zotero note
   * @param {Array} messages - Array of message objects
   * @param {number} parentItemID - Parent item ID for the note
   */
  async exportToNote(messages, parentItemID) {
    if (!parentItemID) {
      Zotero.debug("ZoteroAIAssistant.ExportHelper: No parent item ID");
      return null;
    }
    
    try {
      const html = this.toHTML(messages);
      
      const note = new Zotero.Item("note");
      note.parentID = parentItemID;
      note.setNote(html);
      await note.saveTx();
      
      Zotero.debug(`ZoteroAIAssistant.ExportHelper: Created note ${note.id}`);
      return note.id;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.ExportHelper: Export to note error: " + error);
      return null;
    }
  },
  
  /**
   * Export single response to clipboard
   * @param {string} content - Response content
   */
  copyResponse(content) {
    return this.copyToClipboard(content);
  },
  
  /**
   * Export conversation as Markdown to clipboard
   * @param {Array} messages - Array of message objects
   * @param {object} item - Optional Zotero item
   */
  copyAsMarkdown(messages, item = null) {
    const md = this.toMarkdown(messages, item);
    return this.copyToClipboard(md);
  },
  
  /**
   * Export conversation as plain text to clipboard
   * @param {Array} messages - Array of message objects
   */
  copyAsPlainText(messages) {
    const text = this.toPlainText(messages);
    return this.copyToClipboard(text);
  },
  
  /**
   * Save conversation to file
   * @param {Array} messages - Array of message objects
   * @param {string} format - 'md' or 'txt'
   */
  async saveToFile(messages, format = "md") {
    const content = format === "md" ? this.toMarkdown(messages) : this.toPlainText(messages);
    const filename = `ai-conversation-${Date.now()}.${format}`;
    
    try {
      // Use file picker
      const fp = Components.classes["@mozilla.org/filepicker;1"]
        .createInstance(Components.interfaces.nsIFilePicker);
      
      const window = Services.wm.getMostRecentWindow("navigator:browser");
      fp.init(window, "Save Conversation", Components.interfaces.nsIFilePicker.modeSave);
      fp.defaultString = filename;
      fp.defaultExtension = format;
      
      if (format === "md") {
        fp.appendFilter("Markdown", "*.md");
      } else {
        fp.appendFilter("Text Files", "*.txt");
      }
      
      const result = await new Promise(resolve => fp.open(resolve));
      
      if (result === Components.interfaces.nsIFilePicker.returnOK || 
          result === Components.interfaces.nsIFilePicker.returnReplace) {
        await Zotero.File.putContentsAsync(fp.file.path, content);
        return fp.file.path;
      }
      
      return null;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.ExportHelper: Save to file error: " + error);
      return null;
    }
  }
};
