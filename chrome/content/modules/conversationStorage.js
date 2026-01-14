/**
 * Conversation Storage Module
 * 
 * Stores and retrieves chat history per paper/item using Zotero's database.
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.ConversationStorage = {
  // Storage key prefix
  STORAGE_PREFIX: "zai-conversation-",
  
  // Maximum conversations to keep per item
  MAX_CONVERSATIONS_PER_ITEM: 10,
  
  // Maximum messages per conversation
  MAX_MESSAGES_PER_CONVERSATION: 100,
  
  /**
   * Get the storage key for an item
   */
  getStorageKey(itemID) {
    return this.STORAGE_PREFIX + itemID;
  },
  
  /**
   * Save a conversation for an item
   * @param {number} itemID - Zotero item ID
   * @param {Array} messages - Array of message objects {role, content, timestamp}
   * @param {string} title - Optional conversation title
   */
  async saveConversation(itemID, messages, title = null) {
    if (!itemID || !messages || messages.length === 0) return;
    
    try {
      const key = this.getStorageKey(itemID);
      const existing = await this.getConversations(itemID);
      
      // Create new conversation object
      const conversation = {
        id: Date.now().toString(),
        title: title || this.generateTitle(messages),
        messages: messages.slice(-this.MAX_MESSAGES_PER_CONVERSATION),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // Add to existing conversations
      existing.unshift(conversation);
      
      // Limit number of conversations
      const limited = existing.slice(0, this.MAX_CONVERSATIONS_PER_ITEM);
      
      // Save to Zotero preferences
      Zotero.Prefs.set(key, JSON.stringify(limited), true);
      
      Zotero.debug(`ZoteroAIAssistant.ConversationStorage: Saved conversation for item ${itemID}`);
      
      return conversation.id;
    } catch (error) {
      Zotero.debug(`ZoteroAIAssistant.ConversationStorage: Save error: ${error}`);
      return null;
    }
  },
  
  /**
   * Update an existing conversation
   */
  async updateConversation(itemID, conversationID, messages) {
    if (!itemID || !conversationID) return false;
    
    try {
      const key = this.getStorageKey(itemID);
      const conversations = await this.getConversations(itemID);
      
      const index = conversations.findIndex(c => c.id === conversationID);
      if (index === -1) return false;
      
      conversations[index].messages = messages.slice(-this.MAX_MESSAGES_PER_CONVERSATION);
      conversations[index].updatedAt = new Date().toISOString();
      conversations[index].title = this.generateTitle(messages);
      
      Zotero.Prefs.set(key, JSON.stringify(conversations), true);
      
      return true;
    } catch (error) {
      Zotero.debug(`ZoteroAIAssistant.ConversationStorage: Update error: ${error}`);
      return false;
    }
  },
  
  /**
   * Get all conversations for an item
   */
  async getConversations(itemID) {
    if (!itemID) return [];
    
    try {
      const key = this.getStorageKey(itemID);
      const data = Zotero.Prefs.get(key, true);
      
      if (!data) return [];
      
      return JSON.parse(data);
    } catch (error) {
      Zotero.debug(`ZoteroAIAssistant.ConversationStorage: Get error: ${error}`);
      return [];
    }
  },
  
  /**
   * Get a specific conversation
   */
  async getConversation(itemID, conversationID) {
    const conversations = await this.getConversations(itemID);
    return conversations.find(c => c.id === conversationID) || null;
  },
  
  /**
   * Delete a conversation
   */
  async deleteConversation(itemID, conversationID) {
    if (!itemID || !conversationID) return false;
    
    try {
      const key = this.getStorageKey(itemID);
      const conversations = await this.getConversations(itemID);
      
      const filtered = conversations.filter(c => c.id !== conversationID);
      
      if (filtered.length === conversations.length) return false;
      
      Zotero.Prefs.set(key, JSON.stringify(filtered), true);
      
      return true;
    } catch (error) {
      Zotero.debug(`ZoteroAIAssistant.ConversationStorage: Delete error: ${error}`);
      return false;
    }
  },
  
  /**
   * Clear all conversations for an item
   */
  async clearConversations(itemID) {
    if (!itemID) return false;
    
    try {
      const key = this.getStorageKey(itemID);
      Zotero.Prefs.clear(key, true);
      return true;
    } catch (error) {
      Zotero.debug(`ZoteroAIAssistant.ConversationStorage: Clear error: ${error}`);
      return false;
    }
  },
  
  /**
   * Generate a title from the first user message
   */
  generateTitle(messages) {
    const firstUserMsg = messages.find(m => m.role === "user");
    if (!firstUserMsg) return "New Conversation";
    
    const content = firstUserMsg.content || "";
    // Take first 50 chars, trim at word boundary
    let title = content.substring(0, 50);
    if (content.length > 50) {
      const lastSpace = title.lastIndexOf(" ");
      if (lastSpace > 20) {
        title = title.substring(0, lastSpace);
      }
      title += "...";
    }
    return title || "New Conversation";
  },
  
  /**
   * Export conversation to Zotero note
   */
  async exportToNote(itemID, conversationID) {
    const conversation = await this.getConversation(itemID, conversationID);
    if (!conversation) return null;
    
    const item = await Zotero.Items.getAsync(itemID);
    if (!item) return null;
    
    // Format conversation as HTML
    let noteContent = `<h1>AI Assistant Conversation</h1>`;
    noteContent += `<p><em>Exported: ${new Date().toLocaleString()}</em></p>`;
    noteContent += `<hr/>`;
    
    for (const msg of conversation.messages) {
      const role = msg.role === "user" ? "You" : "AI";
      const content = msg.content.replace(/\n/g, "<br/>");
      noteContent += `<p><strong>${role}:</strong></p>`;
      noteContent += `<p>${content}</p>`;
      noteContent += `<br/>`;
    }
    
    // Create note
    const note = new Zotero.Item("note");
    note.parentID = itemID;
    note.setNote(noteContent);
    await note.saveTx();
    
    Zotero.debug(`ZoteroAIAssistant.ConversationStorage: Exported to note ${note.id}`);
    
    return note.id;
  },
  
  /**
   * Get conversation count for an item
   */
  async getConversationCount(itemID) {
    const conversations = await this.getConversations(itemID);
    return conversations.length;
  }
};
