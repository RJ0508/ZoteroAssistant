/**
 * Token Storage Service
 * 
 * Securely stores OAuth tokens using Mozilla's nsILoginManager
 * This provides encrypted storage for sensitive credentials
 */

var ZoteroAIAssistant = ZoteroAIAssistant || {};

ZoteroAIAssistant.TokenStorage = {
  // Storage identifiers
  HOSTNAME: "chrome://zotero-ai-assistant",
  
  REALMS: {
    GITHUB_COPILOT: "GitHub Copilot OAuth Token",
    GITHUB_COPILOT_SESSION: "GitHub Copilot Session Token"
  },
  
  /**
   * Get the login manager service
   */
  get loginManager() {
    return Components.classes["@mozilla.org/login-manager;1"]
      .getService(Components.interfaces.nsILoginManager);
  },
  
  /**
   * Create a login info object
   */
  createLoginInfo(realm, username, password) {
    const loginInfo = Components.classes["@mozilla.org/login-manager/loginInfo;1"]
      .createInstance(Components.interfaces.nsILoginInfo);
    
    loginInfo.init(
      this.HOSTNAME,
      null,
      realm,
      username,
      password,
      "",
      ""
    );
    
    return loginInfo;
  },
  
  /**
   * Store a token securely
   * @param {string} realm - The token realm (from REALMS)
   * @param {string} token - The token value
   * @param {object} metadata - Optional metadata (stored as JSON in username)
   */
  async storeToken(realm, token, metadata = {}) {
    try {
      // Remove existing token first
      await this.removeToken(realm);
      
      const username = JSON.stringify({
        ...metadata,
        storedAt: Date.now()
      });
      
      const loginInfo = this.createLoginInfo(realm, username, token);
      this.loginManager.addLogin(loginInfo);
      
      Zotero.debug("ZoteroAIAssistant.TokenStorage: Stored token for realm: " + realm);
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.TokenStorage: Failed to store token: " + error);
      return false;
    }
  },
  
  /**
   * Retrieve a stored token
   * @param {string} realm - The token realm
   * @returns {object|null} - { token, metadata } or null if not found
   */
  async getToken(realm) {
    try {
      const logins = this.loginManager.findLogins(this.HOSTNAME, null, realm);
      
      if (logins.length === 0) {
        return null;
      }
      
      const login = logins[0];
      let metadata = {};
      
      try {
        metadata = JSON.parse(login.username);
      } catch (e) {
        // Username might not be JSON
      }
      
      return {
        token: login.password,
        metadata
      };
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.TokenStorage: Failed to get token: " + error);
      return null;
    }
  },
  
  /**
   * Remove a stored token
   * @param {string} realm - The token realm
   */
  async removeToken(realm) {
    try {
      const logins = this.loginManager.findLogins(this.HOSTNAME, null, realm);
      
      for (const login of logins) {
        this.loginManager.removeLogin(login);
      }
      
      Zotero.debug("ZoteroAIAssistant.TokenStorage: Removed token for realm: " + realm);
      return true;
    } catch (error) {
      Zotero.debug("ZoteroAIAssistant.TokenStorage: Failed to remove token: " + error);
      return false;
    }
  },
  
  /**
   * Check if a token exists and is not expired
   * @param {string} realm - The token realm
   * @param {number} maxAge - Maximum age in milliseconds (optional)
   */
  async hasValidToken(realm, maxAge = null) {
    const result = await this.getToken(realm);
    
    if (!result) {
      return false;
    }
    
    if (maxAge && result.metadata.storedAt) {
      const age = Date.now() - result.metadata.storedAt;
      if (age > maxAge) {
        return false;
      }
    }
    
    if (result.metadata.expiresAt && Date.now() > result.metadata.expiresAt) {
      return false;
    }
    
    return true;
  },
  
  /**
   * Clear all stored tokens
   */
  async clearAll() {
    for (const realm of Object.values(this.REALMS)) {
      await this.removeToken(realm);
    }
    Zotero.debug("ZoteroAIAssistant.TokenStorage: Cleared all tokens");
  }
};
