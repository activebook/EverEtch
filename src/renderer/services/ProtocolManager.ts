import { ToastManager } from '../components/ToastManager.js';
import { WordManager } from './WordManager.js';

export class ProtocolManager {
  private toastManager: ToastManager;
  private wordManager: WordManager;

  constructor(toastManager: ToastManager, wordManager: WordManager) {
    this.toastManager = toastManager;
    this.wordManager = wordManager;
    this.setupProtocolHandlers();
  }

  private setupProtocolHandlers(): void {
    // Set up protocol handlers for custom URL scheme
    window.electronAPI.onProtocolNavigateWord((wordName: string) => {
      console.log('🎯 Renderer: Received protocol navigation request for word:', wordName);
      this.handleProtocolNavigateWord(wordName);
    });

    window.electronAPI.onProtocolSwitchProfile((profileName: string) => {
      console.log('🎯 Renderer: Received protocol profile switch request for:', profileName);
      this.handleProtocolSwitchProfile(profileName);
    });
  }

  public async handleProtocolNavigateWord(wordName: string): Promise<void> {
    try {
      console.log('🎯 Renderer: Handling protocol navigation to word:', wordName);

      // Try to find the word by name
      const word = await window.electronAPI.getWordByName(wordName);
      if (word) {
        // Word found, select it
        // This will be handled by the main app's word selection logic
        this.toastManager.showSuccess(`Navigated to word: ${wordName}`);
      } else {
        // Word not found, auto-generate it!
        console.log('🎯 Renderer: Word not found, auto-generating:', wordName);
        await this.autoGenerateWord(wordName);
      }
    } catch (error) {
      console.error('Error handling protocol navigation:', error);
      this.toastManager.showError('Failed to navigate to word');
    }
  }

  public async handleProtocolSwitchProfile(profileName: string): Promise<void> {
    try {
      console.log('Handling protocol profile switch to:', profileName);

      // Check if the profile exists
      const profiles = await window.electronAPI.getProfiles();
      if (profiles.includes(profileName)) {
        // Profile exists, switch to it
        // This will be handled by the main app's profile switching logic
        this.toastManager.showSuccess(`Switched to profile: ${profileName}`);
      } else {
        this.toastManager.showError(`Profile "${profileName}" not found`);
      }
    } catch (error) {
      console.error('Error handling protocol profile switch:', error);
      this.toastManager.showError('Failed to switch profile');
    }
  }

  private async autoGenerateWord(wordName: string): Promise<void> {
    try {
      // Check if we're already generating something
      if (this.wordManager.getIsGenerating()) {
        this.toastManager.showWarning('Please wait for current generation to complete');
        return;
      }

      // Set the word in input field
      const wordInput = document.getElementById('word-input') as HTMLInputElement;
      wordInput.value = wordName;

      // Show loading message
      this.toastManager.showInfo(`Generating word: ${wordName}...`);

      // Trigger generation using WordManager
      await this.wordManager.handleGenerate();

      // The word should now be generated and selected
      this.toastManager.showSuccess(`Word "${wordName}" generated and selected!`);

    } catch (error) {
      console.error('Error auto-generating word:', error);
      this.toastManager.showError(`Failed to generate word: ${wordName}`);
    }
  }

  // Clean up protocol handlers
  cleanup(): void {
    // Remove all listeners for protocol events
    window.electronAPI.removeAllListeners('protocol-navigate-word');
    window.electronAPI.removeAllListeners('protocol-switch-profile');
  }

  // Get protocol URL schemes for different operations
  getProtocolUrls(): { navigateWord: (word: string) => string; switchProfile: (profile: string) => string } {
    return {
      navigateWord: (word: string) => `everetch://navigate/${encodeURIComponent(word)}`,
      switchProfile: (profile: string) => `everetch://profile/${encodeURIComponent(profile)}`
    };
  }

  // Generate protocol URLs for sharing
  generateShareableLinks(wordName?: string, profileName?: string): { wordLink?: string; profileLink?: string } {
    const urls = this.getProtocolUrls();
    return {
      wordLink: wordName ? urls.navigateWord(wordName) : undefined,
      profileLink: profileName ? urls.switchProfile(profileName) : undefined
    };
  }

  // Handle protocol URL parsing (for future use)
  parseProtocolUrl(url: string): { action: string; parameter: string } | null {
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== 'everetch:') {
        return null;
      }

      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      if (pathParts.length < 2) {
        return null;
      }

      const action = pathParts[0];
      const parameter = decodeURIComponent(pathParts[1]);

      return { action, parameter };
    } catch (error) {
      console.error('Error parsing protocol URL:', error);
      return null;
    }
  }
}
