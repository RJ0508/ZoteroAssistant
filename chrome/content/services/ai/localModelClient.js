/**
 * Local Model Client
 * 
 * Supports Ollama and LM Studio for local AI model inference.
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.LocalModelClient = {
  // Default endpoints
  OLLAMA_DEFAULT_URL: "http://localhost:11434",
  LM_STUDIO_DEFAULT_URL: "http://localhost:1234",
  
  /**
   * Get configured endpoint URL
   */
  getEndpoint(provider) {
    if (provider === "ollama") {
      return Zotero.Prefs.get("extensions.zotero-ai-assistant.ollamaEndpoint", true) || this.OLLAMA_DEFAULT_URL;
    } else if (provider === "lmstudio") {
      return Zotero.Prefs.get("extensions.zotero-ai-assistant.lmstudioEndpoint", true) || this.LM_STUDIO_DEFAULT_URL;
    }
    return null;
  },
  
  /**
   * Check if local model server is running
   */
  async checkConnection(provider) {
    const endpoint = this.getEndpoint(provider);
    if (!endpoint) return { connected: false, error: "No endpoint configured" };
    
    try {
      let testUrl;
      if (provider === "ollama") {
        testUrl = `${endpoint}/api/tags`;
      } else if (provider === "lmstudio") {
        // LM Studio uses OpenAI-compatible API on /v1/models
        testUrl = `${endpoint}/v1/models`;
      }
      
      Zotero.debug(`ZoteroAIAssistant.LocalModelClient: Testing ${provider} at ${testUrl}`);
      
      const response = await fetch(testUrl, {
        method: "GET",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        }
      });
      
      if (response.ok) {
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          Zotero.debug(`ZoteroAIAssistant.LocalModelClient: ${provider} returned invalid JSON: ${text.substring(0, 100)}`);
          return { connected: false, error: "Invalid JSON response from server" };
        }
        Zotero.debug(`ZoteroAIAssistant.LocalModelClient: ${provider} connected, response: ${JSON.stringify(data).substring(0, 200)}`);
        return { connected: true, models: this.parseModels(provider, data) };
      }
      
      Zotero.debug(`ZoteroAIAssistant.LocalModelClient: ${provider} returned ${response.status}`);
      return { connected: false, error: `Server returned ${response.status}` };
    } catch (error) {
      Zotero.debug(`ZoteroAIAssistant.LocalModelClient: ${provider} error: ${error.message}`);
      // Provide helpful error message for LM Studio
      if (provider === "lmstudio" && error.message.includes("NetworkError")) {
        return { connected: false, error: "Not running. Start Local Server in LM Studio app (Developer tab)." };
      }
      return { connected: false, error: error.message };
    }
  },
  
  /**
   * Parse models response
   */
  parseModels(provider, data) {
    if (provider === "ollama") {
      return (data.models || []).map(m => ({
        id: m.name,
        name: m.name,
        size: m.size,
        modified: m.modified_at
      }));
    } else if (provider === "lmstudio") {
      return (data.data || []).map(m => ({
        id: m.id,
        name: m.id
      }));
    }
    return [];
  },

  normalizeMessagesForProvider(provider, messages) {
    if (!Array.isArray(messages)) {
      return [];
    }
    if (provider === "ollama") {
      return this.normalizeMessagesForOllama(messages);
    }
    if (provider === "lmstudio") {
      return this.normalizeMessagesForOpenAI(messages);
    }
    return messages;
  },

  normalizeMessagesForOllama(messages) {
    return messages.map(message => {
      const normalized = {
        role: message.role,
        content: message.content || ""
      };
      if (Array.isArray(message.images) && message.images.length) {
        normalized.images = message.images.map(image => this.stripDataUrlPrefix(image));
      }
      return normalized;
    });
  },

  normalizeMessagesForOpenAI(messages) {
    return messages.map(message => {
      if (Array.isArray(message.content)) {
        return message;
      }
      if (!Array.isArray(message.images) || message.images.length === 0) {
        return {
          role: message.role,
          content: message.content || ""
        };
      }
      const parts = [];
      parts.push({ type: "text", text: message.content || "" });
      for (const image of message.images) {
        parts.push({ type: "image_url", image_url: { url: image } });
      }
      return {
        role: message.role,
        content: parts
      };
    });
  },

  stripDataUrlPrefix(dataUrl) {
    if (!dataUrl) return "";
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex === -1) {
      return dataUrl;
    }
    return dataUrl.slice(commaIndex + 1);
  },
  
  /**
   * Get available models
   */
  async getModels(provider) {
    const result = await this.checkConnection(provider);
    if (result.connected) {
      return result.models;
    }
    return [];
  },
  
  /**
   * Chat with local model
   * @param {object} options - Chat options
   * @param {string} options.provider - 'ollama' or 'lmstudio'
   * @param {string} options.model - Model name
   * @param {Array} options.messages - Messages array
   * @param {boolean} options.stream - Whether to stream
   * @param {function} options.onChunk - Streaming callback
   * @param {AbortSignal} options.signal - Abort signal
   */
  async chat({ provider, model, messages, stream = true, onChunk, signal }) {
    const endpoint = this.getEndpoint(provider);
    if (!endpoint) {
      throw new Error(`No endpoint configured for ${provider}`);
    }
    
    // Get temperature and max tokens from preferences
    const temperature = Zotero.Prefs.get("extensions.zotero-ai-assistant.temperature", true) ?? 0.3;
    const maxTokens = Zotero.Prefs.get("extensions.zotero-ai-assistant.maxTokens", true) ?? 2000;
    const normalizedMessages = this.normalizeMessagesForProvider(provider, messages);
    
    if (provider === "ollama") {
      return this.chatOllama({ endpoint, model, messages: normalizedMessages, stream, onChunk, signal, temperature, maxTokens });
    } else if (provider === "lmstudio") {
      return this.chatLMStudio({ endpoint, model, messages: normalizedMessages, stream, onChunk, signal, temperature, maxTokens });
    }
    
    throw new Error(`Unknown provider: ${provider}`);
  },
  
  /**
   * Chat with Ollama
   */
  async chatOllama({ endpoint, model, messages, stream, onChunk, signal, temperature, maxTokens }) {
    const url = `${endpoint}/api/chat`;
    
    const body = {
      model,
      messages,
      stream,
      options: {
        temperature,
        num_predict: maxTokens
      }
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error: ${response.status} - ${text}`);
    }
    
    if (stream) {
      return this.handleOllamaStream(response, onChunk);
    }
    
    const data = await response.json();
    return {
      content: data.message?.content || "",
      model: data.model,
      done: data.done
    };
  },
  
  /**
   * Handle Ollama streaming response
   */
  async handleOllamaStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullContent += data.message.content;
              if (onChunk) {
                onChunk(data.message.content, fullContent);
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return { content: fullContent };
  },
  
  /**
   * Chat with LM Studio (OpenAI-compatible API)
   */
  async chatLMStudio({ endpoint, model, messages, stream, onChunk, signal, temperature, maxTokens }) {
    const url = `${endpoint}/v1/chat/completions`;
    
    const body = {
      model,
      messages,
      stream,
      temperature,
      max_tokens: maxTokens
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`LM Studio error: ${response.status} - ${text}`);
    }
    
    if (stream) {
      return this.handleLMStudioStream(response, onChunk);
    }
    
    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || "",
      model: data.model
    };
  },
  
  /**
   * Handle LM Studio streaming response (SSE format)
   */
  async handleLMStudioStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") continue;
            
            try {
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                if (onChunk) {
                  onChunk(content, fullContent);
                }
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return { content: fullContent };
  },
  
  /**
   * Generate completion (non-chat mode for Ollama)
   */
  async generate({ model, prompt, stream = false, onChunk, signal }) {
    const endpoint = this.getEndpoint("ollama");
    if (!endpoint) {
      throw new Error("Ollama endpoint not configured");
    }
    
    const url = `${endpoint}/api/generate`;
    
    const body = {
      model,
      prompt,
      stream
    };
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal
    });
    
    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }
    
    if (stream) {
      return this.handleOllamaGenerateStream(response, onChunk);
    }
    
    const data = await response.json();
    return { content: data.response || "" };
  },
  
  /**
   * Handle Ollama generate streaming
   */
  async handleOllamaGenerateStream(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(line => line.trim());
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              fullContent += data.response;
              if (onChunk) {
                onChunk(data.response, fullContent);
              }
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return { content: fullContent };
  }
};
