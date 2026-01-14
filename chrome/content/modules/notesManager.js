/**
 * Notes Manager Module
 * 
 * Integrates with Zotero notes for reading and AI-assisted writing.
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.NotesManager = {
  /**
   * Get all notes for an item
   * @param {Zotero.Item} item - Parent item
   * @returns {Promise<Array>} Array of note objects
   */
  async getNotesForItem(item) {
    if (!item) return [];
    
    try {
      const noteIDs = item.getNotes?.() || [];
      const notes = [];
      
      for (const noteID of noteIDs) {
        const note = await Zotero.Items.getAsync(noteID);
        if (note) {
          notes.push({
            id: note.id,
            content: note.getNote?.() || "",
            dateAdded: note.dateAdded,
            dateModified: note.dateModified
          });
        }
      }
      
      return notes;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.NotesManager: Error getting notes: " + error);
      return [];
    }
  },
  
  /**
   * Get plain text from note HTML
   */
  noteToPlainText(noteContent) {
    if (!noteContent) return "";
    
    // Simple HTML to text conversion
    return noteContent
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  },
  
  /**
   * Create a new note for an item
   * @param {number} parentItemID - Parent item ID
   * @param {string} content - Note content (HTML)
   * @returns {Promise<number>} Created note ID
   */
  async createNote(parentItemID, content) {
    if (!parentItemID || !content) return null;
    
    try {
      const note = new Zotero.Item("note");
      note.parentID = parentItemID;
      note.setNote(content);
      await note.saveTx();
      
      Zotero.debug(`ZoteroAIAssistant.NotesManager: Created note ${note.id}`);
      return note.id;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.NotesManager: Error creating note: " + error);
      return null;
    }
  },
  
  /**
   * Append content to an existing note
   * @param {number} noteID - Note ID
   * @param {string} content - Content to append (HTML)
   */
  async appendToNote(noteID, content) {
    if (!noteID || !content) return false;
    
    try {
      const note = await Zotero.Items.getAsync(noteID);
      if (!note) return false;
      
      const existingContent = note.getNote() || "";
      const newContent = existingContent + "<hr/>" + content;
      
      note.setNote(newContent);
      await note.saveTx();
      
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.NotesManager: Error appending to note: " + error);
      return false;
    }
  },
  
  /**
   * Send notes to AI for analysis
   * @param {Zotero.Item} item - Parent item with notes
   * @param {string} action - Type of analysis (summarize, expand, improve, questions)
   */
  async analyzeNotes(item, action = "summarize") {
    if (!item) return "No item provided.";
    
    const notes = await this.getNotesForItem(item);
    
    if (notes.length === 0) {
      return "No notes found for this paper. Add some notes first!";
    }
    
    // Combine all notes
    const allNotes = notes.map((note, index) => {
      const text = this.noteToPlainText(note.content);
      return `Note ${index + 1}:\n${text}`;
    }).join("\n\n---\n\n");
    
    // Build prompt based on action
    let prompt;
    switch (action) {
      case "summarize":
        prompt = `Please summarize the key points from my notes on this paper:\n\n${allNotes}`;
        break;
      case "expand":
        prompt = `Based on my notes, suggest additional points or details I should explore:\n\n${allNotes}`;
        break;
      case "improve":
        prompt = `Help me improve and organize these notes. Suggest better structure and identify gaps:\n\n${allNotes}`;
        break;
      case "questions":
        prompt = `Based on my notes, generate research questions or discussion points:\n\n${allNotes}`;
        break;
      default:
        prompt = `Please analyze my notes:\n\n${allNotes}`;
    }
    
    try {
      const model = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "grok-code-fast-1";
      
      const response = await ZoteroAIAssistant.CopilotClient.chat({
        model,
        messages: [
          {
            role: "system",
            content: "You are an academic research assistant helping analyze and improve research notes. Provide clear, actionable suggestions."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false
      });
      
      return response.content || response.choices?.[0]?.message?.content || "No response received.";
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.NotesManager: Analysis error: " + error);
      return "Error analyzing notes: " + error.message;
    }
  },
  
  /**
   * Generate AI-assisted notes from paper abstract and metadata
   * @param {Zotero.Item} item - Paper item
   */
  async generateNotesTemplate(item) {
    if (!item) return null;
    
    const title = item.getField?.("title") || "";
    const abstract = item.getField?.("abstractNote") || "";
    
    if (!abstract) {
      return "No abstract available to generate notes template.";
    }
    
    const prompt = `Based on this paper, create a structured notes template with:
1. Main Research Question
2. Key Methodology
3. Main Findings (bullet points)
4. Strengths
5. Limitations
6. Relevance to my research (placeholder)
7. Questions/Follow-ups

Paper Title: ${title}
Abstract: ${abstract}

Please provide the template with key information already filled in where possible, and [FILL IN] placeholders for parts I need to complete.`;

    try {
      const model = Zotero.Prefs.get("extensions.zotero-ai-assistant.defaultModel", true) || "grok-code-fast-1";
      
      const response = await ZoteroAIAssistant.CopilotClient.chat({
        model,
        messages: [
          {
            role: "system",
            content: "You are an academic research assistant helping create structured research notes. Generate clear, well-organized note templates."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false
      });
      
      const content = response.content || response.choices?.[0]?.message?.content || "";
      
      if (content) {
        // Convert to HTML for Zotero note
        const htmlContent = this.markdownToHTML(content);
        return htmlContent;
      }
      
      return null;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.NotesManager: Template generation error: " + error);
      return null;
    }
  },
  
  /**
   * Convert markdown to HTML for Zotero notes
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
      // Bullet points
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
      // Numbered lists
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // Line breaks
      .replace(/\n/g, '<br/>');
  },
  
  /**
   * Create notes from AI template
   * @param {Zotero.Item} item - Parent item
   */
  async createNotesFromTemplate(item) {
    if (!item) return null;
    
    const template = await this.generateNotesTemplate(item);
    
    if (!template) {
      return { success: false, message: "Failed to generate notes template." };
    }
    
    const noteID = await this.createNote(item.id, template);
    
    if (noteID) {
      return { success: true, noteID, message: "Notes template created successfully." };
    }
    
    return { success: false, message: "Failed to create note." };
  }
};
