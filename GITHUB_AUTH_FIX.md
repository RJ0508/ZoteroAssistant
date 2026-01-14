# GitHub Authentication Fix - Blank Window Issue

## Problem Summary
When clicking the "Connect" button to authenticate with GitHub Copilot, a blank window would appear and the authentication flow would fail.

## Root Causes Identified

### 1. **Mismatched API Calls**
The `authDialog.xhtml` file was calling the wrong methods from `githubDeviceFlow.js`:
- It was calling `startDeviceFlow()` and then manually trying to poll for tokens
- The return value structure didn't match (expected `user_code` but got `userCode`)
- The polling logic was incomplete and incompatible with the actual implementation

### 2. **Incorrect Authentication Flow**
The dialog was trying to manually implement the polling logic instead of using the comprehensive `authenticate()` method that was already available in `githubDeviceFlow.js`.

## Changes Made

### File: `chrome/content/ui/authDialog.xhtml`

#### Before:
```javascript
async function startGitHubAuth() {
  showStep("step2");
  try {
    const ZAI = mainWindow?.ZoteroAIAssistant;
    if (ZAI && ZAI.GitHubDeviceFlow) {
      const result = await ZAI.GitHubDeviceFlow.startDeviceFlow();
      document.getElementById("zai-device-code").value = result.user_code; // WRONG KEY
      Zotero.launchURL(result.verification_uri);
      pollForToken(ZAI, result); // INCOMPLETE POLLING
    }
  } catch (error) {
    showError(error.message);
  }
}
```

#### After:
```javascript
async function startGitHubAuth() {
  showStep("step2");
  try {
    const ZAI = mainWindow?.ZoteroAIAssistant;
    if (!ZAI || !ZAI.GitHubDeviceFlow) {
      throw new Error("GitHub auth module not loaded");
    }
    
    // Use the comprehensive authenticate() method
    const result = await ZAI.GitHubDeviceFlow.authenticate(
      // Callback when device code is ready
      (userCode, verificationUri) => {
        document.getElementById("zai-device-code").value = userCode;
        try {
          Zotero.launchURL(verificationUri);
        } catch (urlError) {
          // Fallback: show alert if URL opening fails
          alert("Please manually visit: " + verificationUri + 
                "\n\nAnd enter the code shown above.");
        }
      },
      // Callback for status updates during polling
      (status) => {
        const statusEl = document.getElementById("zai-github-status");
        if (statusEl) {
          switch (status) {
            case "waiting":
              statusEl.textContent = "Waiting for authorization...";
              break;
            case "success":
              statusEl.textContent = "Authorization successful!";
              break;
          }
        }
      }
    );
    
    // Display success
    if (result.user) {
      document.getElementById("zai-github-user").value = 
        "Signed in as " + result.user.login;
    } else {
      document.getElementById("zai-github-user").value = 
        "Connected successfully!";
    }
    showStep("step3");
    
  } catch (error) {
    Zotero.debug("ZoteroAIAssistant Auth: Error - " + error.message);
    showError(error.message || "Authentication failed. Please try again.");
  }
}
```

### Key Improvements:

1. **Proper Method Usage**: Now uses `GitHubDeviceFlow.authenticate()` which handles the entire OAuth flow including:
   - Requesting device code
   - Polling for authorization
   - Exchanging tokens
   - Storing credentials

2. **Better Error Handling**: 
   - Added try-catch around `Zotero.launchURL()` with fallback alert
   - Enhanced debug logging
   - Proper error stack traces

3. **Correct Callbacks**: 
   - `onShowCode` callback properly receives and displays the device code
   - `onStatusUpdate` callback provides real-time status updates during polling

4. **Improved UI Text**:
   - Updated instructions to clarify that browser should open automatically
   - Added fallback instructions if URL opening fails

## How the Fix Works

### Authentication Flow:
```
1. User clicks "Connect" button
   ↓
2. Dialog calls GitHubDeviceFlow.authenticate() with callbacks
   ↓
3. authenticate() requests device code from GitHub
   ↓
4. onShowCode callback displays code and opens browser
   ↓
5. User authorizes in browser
   ↓
6. authenticate() polls GitHub for authorization (automatic)
   ↓
7. onStatusUpdate provides real-time feedback
   ↓
8. Tokens are exchanged and stored
   ↓
9. Dialog shows success with user info
```

## Testing Instructions

### Prerequisites:
1. Install the plugin in Zotero 7
2. Ensure you have a GitHub account (no special permissions needed)

### Test Steps:

1. **Open Zotero** with the plugin installed

2. **Open a PDF** in the Zotero reader

3. **Click "Connect"** button in the AI Assistant panel

4. **Verify the dialog opens** with "Start Authentication" button

5. **Click "Start Authentication"**

6. **Verify Step 2 shows**:
   - A device code (e.g., "ABCD-1234")
   - Instructions mentioning automatic browser opening
   - Status text "Waiting for authorization..."

7. **Verify browser opens** automatically to `https://github.com/login/device`
   - If browser doesn't open, user should see clear instructions
   - User can click "Copy" button to copy the device code

8. **In the browser**:
   - Paste/enter the device code
   - Click "Continue"
   - Authorize the application

9. **Back in Zotero dialog**:
   - Status should update to "Authorization successful!"
   - Dialog should automatically progress to Step 3
   - Should show "Signed in as [your-github-username]"

10. **Click "Done"** to close the dialog

11. **Verify connection**: The "Connect" button should disappear, indicating successful authentication

### Expected Behavior:
- ✅ Dialog displays correctly (not blank)
- ✅ Browser opens automatically to GitHub
- ✅ Device code is displayed and can be copied
- ✅ Polling happens automatically in background
- ✅ Success message shows with username
- ✅ Authentication persists across Zotero restarts

### Common Issues & Solutions:

#### Issue: Browser doesn't open
**Solution**: The code now includes a fallback alert that shows the URL. User can manually copy/paste into browser.

#### Issue: "GitHub auth module not loaded" error
**Solution**: Ensure the plugin is properly installed. Restart Zotero and try again.

#### Issue: "Device code expired" error
**Solution**: The device code expires after 15 minutes. Click "Try Again" to get a new code.

#### Issue: Dialog is still blank
**Possible causes**:
1. XUL rendering issue - Check Zotero console for errors (`Help > Report Errors to Zotero`)
2. Plugin not properly installed - Reinstall the `.xpi` file
3. Conflicting plugins - Try disabling other plugins temporarily

## Files Modified:
- `chrome/content/ui/authDialog.xhtml` - Fixed authentication flow and improved UI text

## Files Analyzed (No Changes Needed):
- `chrome/content/services/auth/githubDeviceFlow.js` - Implementation was correct
- `chrome/content/ui/sidebar.js` - Dialog opening logic was correct
- `chrome/content/services/ai/copilotClient.js` - API client was correct

## Build Verification:
```bash
npm run build
# ✅ Build successful - zotero-ai-assistant-1.0.0.xpi created
```

## Additional Debug Information:

To check if authentication is working, open Zotero's Error Console:
1. `Help` > `Report Errors to Zotero`
2. Look for messages starting with "ZoteroAIAssistant Auth:"
3. Debug logs will show:
   - "Starting GitHub authentication"
   - "Got device code: [code]"
   - "Opened URL: [url]"
   - "Status - waiting/success"
   - "Authentication completed"

## References:
- GitHub Device Flow Documentation: https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps#device-flow
- GitHub Copilot API: https://docs.github.com/en/rest/copilot
