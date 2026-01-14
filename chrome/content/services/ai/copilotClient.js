/**
 * GitHub Copilot API Client
 * 
 * Handles chat completions with GitHub Copilot API
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.CopilotClient = {
  // API endpoint
  API_URL: "https://api.githubcopilot.com/chat/completions",
  MODELS_URLS: [
    "https://api.githubcopilot.com/models",
    "https://api.githubcopilot.com/chat/models"
  ],
  
  // Editor identification - must use a known/accepted integration ID
  // Using vscode-chat as it's a widely accepted integration ID for Copilot Chat
  EDITOR_VERSION: "vscode/1.96.0",
  COPILOT_INTEGRATION_ID: "vscode-chat",
  
  // Model resolution
  FALLBACK_MODELS: [
    "claude-sonnet-4.5",
    "gpt-5",
    "gpt-5-mini",
    "gpt-4.1",
    "gemini-2.5-pro"
  ],
  MODELS_CACHE_TTL: 5 * 60 * 1000,
  _cachedModels: null,
  _cachedModelsAt: 0,
  
  /**
   * Send a chat completion request
   * @param {object} options
   * @param {string} options.model - Model ID
   * @param {array} options.messages - Array of {role, content} messages
   * @param {boolean} options.stream - Enable streaming
   * @param {function} options.onChunk - Callback for streaming chunks
   * @param {AbortSignal} options.signal - Abort signal
   * @returns {Promise<object>} - Response
   */
  async chat({ model, messages, stream = true, onChunk, signal, temperature, maxTokens }) {
    // Get valid session token
    const token = await ZoteroAIAssistant.GitHubDeviceFlow.getSessionToken();

    const resolvedModel = await this.resolveModel(model);
    const normalizedMessages = this.normalizeMessagesForVision(messages);
    const hasVision = this.hasVisionRequest(normalizedMessages);
    
    // Get temperature and maxTokens from preferences if not provided
    const temp = temperature ?? Zotero.Prefs.get("extensions.zotero-ai-assistant.temperature", true) ?? 0.3;
    const tokens = maxTokens ?? Zotero.Prefs.get("extensions.zotero-ai-assistant.maxTokens", true) ?? 2000;
    
    const body = {
      model: resolvedModel,
      messages: normalizedMessages,
      stream,
      temperature: temp,
      max_tokens: tokens
    };
    
    Zotero.debug(`ZoteroAIAssistant.CopilotClient: Sending request to ${resolvedModel}`);
    
    const headers = this.buildHeaders(stream, hasVision, token);
    
    let response = await fetch(this.API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal
    });
    
    if (!response.ok) {
      const text = await response.text();
      Zotero.debug(`ZoteroAIAssistant.CopilotClient: API error ${response.status}: ${text}`);
      const message = this.formatApiError(response.status, text);
      
      if (this.shouldRetryWithFallback(response.status, text)) {
        const fallbackModel = await this.findFallbackModel(resolvedModel);
        if (fallbackModel && fallbackModel !== resolvedModel) {
          Zotero.debug(`ZoteroAIAssistant.CopilotClient: Retrying with fallback model ${fallbackModel}`);
          
          response = await fetch(this.API_URL, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: fallbackModel,
              messages: normalizedMessages,
              stream,
              temperature: temp,
              max_tokens: tokens
            }),
            signal
          });
          
          if (!response.ok) {
            const retryText = await response.text();
            throw new Error(this.formatApiError(response.status, retryText));
          }
        } else {
          throw new Error(message);
        }
      } else {
        throw new Error(message);
      }
    }
    
    if (stream) {
      return await this.handleStreamingResponse(response, onChunk);
    } else {
      return await response.json();
    }
  },

  normalizeMessagesForVision(messages) {
    if (!Array.isArray(messages)) {
      return [];
    }
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

  hasVisionRequest(messages) {
    if (!Array.isArray(messages)) {
      return false;
    }
    return messages.some(message => {
      if (Array.isArray(message.images) && message.images.length) {
        return true;
      }
      if (Array.isArray(message.content)) {
        return message.content.some(part => part && part.type === "image_url");
      }
      return false;
    });
  },

  buildHeaders(stream, hasVision, token) {
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "Editor-Version": this.EDITOR_VERSION,
      "Copilot-Integration-Id": this.COPILOT_INTEGRATION_ID,
      "Accept": stream ? "text/event-stream" : "application/json"
    };
    if (hasVision) {
      headers["Copilot-Vision-Request"] = "true";
    }
    return headers;
  },
  
  /**
   * Handle streaming SSE response
   */
  async handleStreamingResponse(response, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let errorMessage = null;
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete SSE events
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6).trim();
            
            if (data === "[DONE]") {
              continue;
            }
            
            // Skip empty data lines
            if (!data) {
              continue;
            }
            
            try {
              const json = JSON.parse(data);
              
              // Check for error in the stream
              if (json.error) {
                errorMessage = json.error.message || json.error;
                Zotero.debug("ZoteroAIAssistant.CopilotClient: Stream error: " + errorMessage);
                continue;
              }
              
              const content = json.choices?.[0]?.delta?.content;
              
              if (content) {
                fullContent += content;
                if (onChunk) {
                  onChunk(content, fullContent);
                }
              }
            } catch (e) {
              // Skip invalid JSON lines but log them for debugging
              if (data.length > 0 && !data.startsWith(":")) {
                Zotero.debug("ZoteroAIAssistant.CopilotClient: Skipping non-JSON line: " + data.substring(0, 50));
              }
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    // If we got an error during streaming, throw it
    if (errorMessage && !fullContent) {
      throw new Error(errorMessage);
    }
    
    return {
      content: fullContent,
      model: response.headers.get("x-model") || "unknown"
    };
  },
  
  /**
   * Simple non-streaming chat
   */
  async simpleChat(model, prompt, systemPrompt = null) {
    const messages = [];
    
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    
    messages.push({ role: "user", content: prompt });
    
    const response = await this.chat({
      model,
      messages,
      stream: false
    });
    
    return response.choices?.[0]?.message?.content || "";
  },
  
  /**
   * Resolve a requested model against available Copilot models
   */
  async resolveModel(requestedModel) {
    const available = await this.getAvailableModels();
    
    if (!available.length) {
      return requestedModel || this.FALLBACK_MODELS[0];
    }
    
    if (requestedModel && available.includes(requestedModel)) {
      return requestedModel;
    }
    
    const fallback = this.pickFallbackModel(available);
    if (requestedModel && fallback && fallback !== requestedModel) {
      Zotero.debug(`ZoteroAIAssistant.CopilotClient: Model ${requestedModel} unavailable, using ${fallback}`);
    }
    
    return fallback || requestedModel || available[0];
  },
  
  /**
   * Get available Copilot models, cached for a short period
   */
  async getAvailableModels() {
    const now = Date.now();
    if (this._cachedModels && (now - this._cachedModelsAt) < this.MODELS_CACHE_TTL) {
      return this._cachedModels;
    }
    
    let models = [];
    
    try {
      const token = await ZoteroAIAssistant.GitHubDeviceFlow.getSessionToken();
      
      for (const url of this.MODELS_URLS) {
        try {
          const response = await fetch(url, {
            headers: {
              "Authorization": `Bearer ${token}`,
              "Accept": "application/json",
              "Editor-Version": this.EDITOR_VERSION,
              "Copilot-Integration-Id": this.COPILOT_INTEGRATION_ID
            }
          });
          
          if (!response.ok) {
            Zotero.debug(`ZoteroAIAssistant.CopilotClient: Models endpoint ${url} returned ${response.status}`);
            continue;
          }
          
          const text = await response.text();
          
          // Check if response is valid JSON
          if (!text.trim().startsWith("{") && !text.trim().startsWith("[")) {
            Zotero.debug(`ZoteroAIAssistant.CopilotClient: Models endpoint returned non-JSON: ${text.substring(0, 50)}`);
            continue;
          }
          
          const data = JSON.parse(text);
          models = this.extractModelIds(data);
          
          if (models.length) {
            Zotero.debug(`ZoteroAIAssistant.CopilotClient: Found ${models.length} models from ${url}`);
            break;
          }
        } catch (urlError) {
          Zotero.debug(`ZoteroAIAssistant.CopilotClient: Error fetching from ${url}: ${urlError.message}`);
        }
      }
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.CopilotClient: Failed to fetch models: " + error);
    }
    
    // If we couldn't fetch models, use fallback list
    if (!models.length) {
      Zotero.debug("ZoteroAIAssistant.CopilotClient: Using fallback models list");
      models = [...this.FALLBACK_MODELS];
    }
    
    this._cachedModels = models;
    this._cachedModelsAt = now;
    
    return models;
  },
  
  /**
   * Extract model IDs from different API shapes
   */
  extractModelIds(payload) {
    const ids = [];
    
    const extract = (entry) => {
      if (!entry) return;
      if (typeof entry === "string") {
        ids.push(entry);
        return;
      }
      if (entry.id) {
        ids.push(entry.id);
        return;
      }
      if (entry.model) {
        ids.push(entry.model);
        return;
      }
      if (entry.name) {
        ids.push(entry.name);
      }
    };
    
    if (Array.isArray(payload)) {
      payload.forEach(extract);
    } else if (payload?.data && Array.isArray(payload.data)) {
      payload.data.forEach(extract);
    } else if (payload?.models && Array.isArray(payload.models)) {
      payload.models.forEach(extract);
    }
    
    return ids.filter(Boolean);
  },
  
  /**
   * Pick the best fallback model from an available list
   */
  pickFallbackModel(available) {
    for (const candidate of this.FALLBACK_MODELS) {
      if (available.includes(candidate)) {
        return candidate;
      }
    }
    return available[0] || null;
  },
  
  /**
   * Retry only when the error suggests an invalid model
   */
  shouldRetryWithFallback(status, text) {
    if (status !== 400 && status !== 404 && status !== 422) {
      return false;
    }
    
    const lowered = (text || "").toLowerCase();
    return lowered.includes("model") || lowered.includes("invalid") || lowered.includes("unsupported");
  },
  
  async findFallbackModel(currentModel) {
    const available = await this.getAvailableModels();
    if (available.length) {
      const fallback = this.pickFallbackModel(available);
      if (fallback && fallback !== currentModel) {
        return fallback;
      }
    }
    
    for (const candidate of this.FALLBACK_MODELS) {
      if (candidate !== currentModel) {
        return candidate;
      }
    }
    
    return null;
  },
  
  formatApiError(status, text) {
    let message = text || "Unknown error";
    
    // Handle common HTTP error codes with helpful messages
    if (status === 401) {
      return "Copilot API error (401): Authentication failed. Please reconnect to GitHub Copilot.";
    }
    if (status === 403) {
      return "Copilot API error (403): Access denied. Please ensure you have an active GitHub Copilot subscription.";
    }
    
    try {
      // Only try to parse if it looks like JSON (starts with { or [)
      const trimmedText = (text || "").trim();
      if (trimmedText.startsWith("{") || trimmedText.startsWith("[")) {
        const json = JSON.parse(trimmedText);
        if (json?.error?.message) {
          message = json.error.message;
        } else if (json?.message) {
          message = json.message;
        } else if (json?.error) {
          message = typeof json.error === "string" ? json.error : JSON.stringify(json.error);
        }
      }
    } catch (error) {
      // Leave as raw text - truncate if too long
      if (message.length > 200) {
        message = message.substring(0, 200) + "...";
      }
    }
    return `Copilot API error (${status}): ${message}`;
  }
};
