/**
 * GitHub Device Flow OAuth
 * 
 * Implements GitHub's OAuth 2.0 Device Authorization Flow
 * for authenticating with GitHub Copilot
 * 
 * Flow:
 * 1. Request device code from GitHub
 * 2. Display code to user, they authorize at github.com/login/device
 * 3. Poll for access token
 * 4. Exchange GitHub token for Copilot session token
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.GitHubDeviceFlow = {
  // OAuth configuration (using VS Code's public client ID)
  CLIENT_ID: "Iv1.b507a08c87ecfe98",
  
  // Endpoints
  DEVICE_CODE_URL: "https://github.com/login/device/code",
  ACCESS_TOKEN_URL: "https://github.com/login/oauth/access_token",
  COPILOT_TOKEN_URL: "https://api.github.com/copilot_internal/v2/token",
  USER_INFO_URL: "https://api.github.com/user",
  
  // Polling configuration
  DEFAULT_INTERVAL: 5000, // 5 seconds
  MAX_POLL_TIME: 900000,  // 15 minutes
  
  // State
  currentFlow: null,
  
  /**
   * Start the device flow authentication
   * @returns {Promise<object>} - Device code response with user_code and verification_uri
   */
  async startDeviceFlow() {
    Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Starting device flow");
    
    try {
      // Note: GitHub Copilot uses VS Code's OAuth client which requires no explicit scope
      // The Copilot token endpoint grants access based on the user's Copilot subscription
      const response = await fetch(this.DEVICE_CODE_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          client_id: this.CLIENT_ID
          // No scope needed - Copilot access is determined by user's subscription
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error_description || data.error);
      }
      
      this.currentFlow = {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        expiresIn: data.expires_in,
        interval: data.interval || 5,
        startTime: Date.now()
      };
      
      Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Got device code: " + data.user_code);
      
      return {
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        expiresIn: data.expires_in
      };
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Failed to start device flow: " + error);
      throw error;
    }
  },
  
  /**
   * Poll for the access token after user authorizes
   * @param {function} onStatusUpdate - Callback for status updates
   * @returns {Promise<string>} - Access token
   */
  async pollForToken(onStatusUpdate) {
    if (!this.currentFlow) {
      throw new Error("No active device flow. Call startDeviceFlow first.");
    }
    
    const { deviceCode, interval, expiresIn, startTime } = this.currentFlow;
    const pollInterval = Math.max(interval * 1000, this.DEFAULT_INTERVAL);
    const expiresAt = startTime + (expiresIn * 1000);
    
    return new Promise((resolve, reject) => {
      const poll = async () => {
        // Check if expired
        if (Date.now() > expiresAt) {
          this.currentFlow = null;
          reject(new Error("Device code expired. Please try again."));
          return;
        }
        
        try {
          const response = await fetch(this.ACCESS_TOKEN_URL, {
            method: "POST",
            headers: {
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              client_id: this.CLIENT_ID,
              device_code: deviceCode,
              grant_type: "urn:ietf:params:oauth:grant-type:device_code"
            })
          });
          
          const data = await response.json();
          
          if (data.error) {
            switch (data.error) {
              case "authorization_pending":
                // User hasn't authorized yet, continue polling
                if (onStatusUpdate) {
                  onStatusUpdate("waiting");
                }
                setTimeout(poll, pollInterval);
                break;
                
              case "slow_down":
                // Need to slow down polling
                setTimeout(poll, pollInterval + 5000);
                break;
                
              case "expired_token":
                this.currentFlow = null;
                reject(new Error("Device code expired. Please try again."));
                break;
                
              case "access_denied":
                this.currentFlow = null;
                reject(new Error("Access denied by user."));
                break;
                
              default:
                reject(new Error(data.error_description || data.error));
            }
          } else if (data.access_token) {
            // Success!
            this.currentFlow = null;
            
            if (onStatusUpdate) {
              onStatusUpdate("success");
            }
            
            resolve(data.access_token);
          } else {
            reject(new Error("Unexpected response from GitHub"));
          }
        } catch (error) {
          reject(error);
        }
      };
      
      // Start polling
      poll();
    });
  },
  
  /**
   * Exchange GitHub access token for Copilot session token
   * @param {string} accessToken - GitHub OAuth access token
   * @returns {Promise<object>} - Copilot session token with expiry
   */
  async getCopilotToken(accessToken) {
    Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Exchanging for Copilot token");
    
    try {
      const response = await fetch(this.COPILOT_TOKEN_URL, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json",
          "Editor-Version": "vscode/1.96.0",
          "Editor-Plugin-Version": "copilot-chat/0.24.0",
          "User-Agent": "GitHubCopilotChat/0.24.0"
        }
      });
      
      if (!response.ok) {
        const text = await response.text();
        Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Copilot token error response: " + text);
        
        // Provide specific error messages
        if (response.status === 401) {
          throw new Error("GitHub token is invalid or expired. Please re-authenticate.");
        }
        if (response.status === 403) {
          throw new Error("You do not have access to GitHub Copilot. Please ensure you have an active subscription.");
        }
        if (response.status === 404) {
          throw new Error("GitHub Copilot is not enabled for your account. Please check your subscription.");
        }
        
        // Try to parse JSON error message
        try {
          const trimmed = text.trim();
          if (trimmed.startsWith("{")) {
            const json = JSON.parse(trimmed);
            throw new Error(json.message || json.error || `HTTP ${response.status}`);
          }
        } catch (parseErr) {
          // Not JSON, use the text directly
        }
        
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 100)}`);
      }
      
      const text = await response.text();
      Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Copilot token response received");
      
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Failed to parse token response: " + text.substring(0, 100));
        throw new Error("Invalid response from Copilot token endpoint");
      }
      
      if (!data.token) {
        throw new Error("No token in Copilot response");
      }
      
      return {
        token: data.token,
        expiresAt: data.expires_at * 1000 // Convert to milliseconds
      };
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Failed to get Copilot token: " + error);
      throw error;
    }
  },
  
  /**
   * Get user information from GitHub
   * @param {string} accessToken - GitHub OAuth access token
   * @returns {Promise<object>} - User info
   */
  async getUserInfo(accessToken) {
    try {
      const response = await fetch(this.USER_INFO_URL, {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json"
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        id: data.id,
        login: data.login,
        name: data.name,
        avatarUrl: data.avatar_url
      };
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Failed to get user info: " + error);
      return null;
    }
  },
  
  /**
   * Complete the full authentication flow
   * @param {function} onShowCode - Callback with (userCode, verificationUri)
   * @param {function} onStatusUpdate - Callback for status updates
   * @returns {Promise<object>} - { accessToken, copilotToken, user }
   */
  async authenticate(onShowCode, onStatusUpdate) {
    // Step 1: Get device code
    const { userCode, verificationUri } = await this.startDeviceFlow();
    
    // Step 2: Show code to user
    if (onShowCode) {
      onShowCode(userCode, verificationUri);
    }
    
    // Step 3: Poll for access token
    const accessToken = await this.pollForToken(onStatusUpdate);
    
    // Step 4: Get Copilot session token
    const copilotToken = await this.getCopilotToken(accessToken);
    
    // Step 5: Get user info
    const user = await this.getUserInfo(accessToken);
    
    // Step 6: Store tokens
    await ZoteroAIAssistant.TokenStorage.storeToken(
      ZoteroAIAssistant.TokenStorage.REALMS.GITHUB_COPILOT,
      accessToken,
      { user }
    );
    
    await ZoteroAIAssistant.TokenStorage.storeToken(
      ZoteroAIAssistant.TokenStorage.REALMS.GITHUB_COPILOT_SESSION,
      copilotToken.token,
      { expiresAt: copilotToken.expiresAt }
    );
    
    return { accessToken, copilotToken, user };
  },
  
  /**
   * Cancel the current device flow
   */
  cancelFlow() {
    this.currentFlow = null;
  },
  
  /**
   * Check if we have a valid Copilot session
   */
  async hasValidSession() {
    try {
      const token = await this.getSessionToken();
      return !!token;
    } catch (error) {
      return false;
    }
  },
  
  /**
   * Get the current Copilot session token (refreshing if needed)
   */
  async getSessionToken() {
    // Check if we have a valid session token
    const session = await ZoteroAIAssistant.TokenStorage.getToken(
      ZoteroAIAssistant.TokenStorage.REALMS.GITHUB_COPILOT_SESSION
    );
    
    // Give 5 minute buffer before expiry to refresh proactively
    const bufferTime = 5 * 60 * 1000;
    if (session && session.metadata.expiresAt > (Date.now() + bufferTime)) {
      return session.token;
    }
    
    Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Session token needs refresh");
    
    // Need to refresh - get the access token
    const auth = await ZoteroAIAssistant.TokenStorage.getToken(
      ZoteroAIAssistant.TokenStorage.REALMS.GITHUB_COPILOT
    );
    
    if (!auth || !auth.token) {
      throw new Error("Not authenticated. Please connect to GitHub Copilot.");
    }
    
    try {
      // Get new Copilot token
      const copilotToken = await this.getCopilotToken(auth.token);
      
      // Store it
      await ZoteroAIAssistant.TokenStorage.storeToken(
        ZoteroAIAssistant.TokenStorage.REALMS.GITHUB_COPILOT_SESSION,
        copilotToken.token,
        { expiresAt: copilotToken.expiresAt }
      );
      
      return copilotToken.token;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Failed to refresh session: " + error);
      
      // If refresh failed, the OAuth token might be invalid
      // Clear both tokens so user can re-authenticate
      if (error.message.includes("401") || error.message.includes("invalid") || error.message.includes("expired")) {
        await this.disconnect();
        throw new Error("GitHub session expired. Please reconnect to GitHub Copilot.");
      }
      
      throw error;
    }
  },
  
  /**
   * Disconnect from GitHub Copilot
   */
  async disconnect() {
    await ZoteroAIAssistant.TokenStorage.removeToken(
      ZoteroAIAssistant.TokenStorage.REALMS.GITHUB_COPILOT
    );
    await ZoteroAIAssistant.TokenStorage.removeToken(
      ZoteroAIAssistant.TokenStorage.REALMS.GITHUB_COPILOT_SESSION
    );
    Zotero.debug("ZoteroAIAssistant.GitHubDeviceFlow: Disconnected");
  }
};
