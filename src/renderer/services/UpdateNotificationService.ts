export interface UpdateInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  release?: {
    tag_name: string;
    name: string;
    body: string;
    published_at: string;
  };
}

export class UpdateNotificationService {
  private static instance: UpdateNotificationService;
  private updateAvailableCallback: ((updateInfo: UpdateInfo) => void) | null = null;

  private constructor() {
    this.setupIPCListeners();
  }

  static getInstance(): UpdateNotificationService {
    if (!UpdateNotificationService.instance) {
      UpdateNotificationService.instance = new UpdateNotificationService();
    }
    return UpdateNotificationService.instance;
  }

  /**
   * Set callback for when updates are available
   */
  onUpdateAvailable(callback: (updateInfo: UpdateInfo) => void): void {
    this.updateAvailableCallback = callback;
  }

  /**
   * Check for updates manually
   */
  async checkForUpdates(): Promise<{ success: boolean; updateInfo?: UpdateInfo; error?: string }> {
    try {
      const result = await window.electronAPI.checkForUpdates();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Download update
   */
  async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.electronAPI.downloadUpdate();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Install update
   */
  async installUpdate(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await window.electronAPI.installUpdate();
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Show update notification toast
   */
  showUpdateNotification(updateInfo: UpdateInfo): void {
    // Create a simple notification element
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
      <div class="update-notification-content">
        <h4>🎉 Update Available!</h4>
        <p>EverEtch ${updateInfo.latest} is available (current: ${updateInfo.current})</p>
        <div class="update-notification-actions">
          <button class="btn-primary" onclick="this.closest('.update-notification').remove()">Later</button>
          <button class="btn-secondary" onclick="window.updateNotificationService.downloadAndInstallUpdate()">Download & Install</button>
        </div>
      </div>
    `;

    // Add styles
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #1f2937;
      color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      border-left: 4px solid #3b82f6;
    `;

    document.body.appendChild(notification);

    // Auto-remove after 10 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 10000);
  }

  /**
   * Download and install update (convenience method)
   */
  async downloadAndInstallUpdate(): Promise<void> {
    try {
      // Close notification if open
      const notification = document.querySelector('.update-notification');
      if (notification) {
        notification.remove();
      }

      // Show downloading state
      this.showProgressNotification('Downloading update...');

      const downloadResult = await this.downloadUpdate();
      if (!downloadResult.success) {
        throw new Error(downloadResult.error);
      }

      // Show installing state
      this.showProgressNotification('Installing update...');

      const installResult = await this.installUpdate();
      if (!installResult.success) {
        throw new Error(installResult.error);
      }

      this.showProgressNotification('Update installed! Restarting...');

    } catch (error) {
      this.showErrorNotification(error instanceof Error ? error.message : 'Update failed');
    }
  }

  /**
   * Show progress notification
   */
  private showProgressNotification(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'update-progress-notification';
    notification.innerHTML = `
      <div class="update-progress-content">
        <h4>🔄 ${message}</h4>
        <div class="progress-bar">
          <div class="progress-fill"></div>
        </div>
      </div>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #1f2937;
      color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
    `;

    document.body.appendChild(notification);
  }

  /**
   * Show error notification
   */
  private showErrorNotification(message: string): void {
    const notification = document.createElement('div');
    notification.className = 'update-error-notification';
    notification.innerHTML = `
      <div class="update-error-content">
        <h4>❌ Update Failed</h4>
        <p>${message}</p>
        <button onclick="this.closest('.update-error-notification').remove()">Close</button>
      </div>
    `;

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #7f1d1d;
      color: white;
      padding: 20px;
      border-radius: 8px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      border-left: 4px solid #ef4444;
    `;

    document.body.appendChild(notification);
  }

  /**
   * Set up IPC event listeners
   */
  private setupIPCListeners(): void {
   
  }
}

// Global reference for HTML onclick handlers
declare global {
  interface Window {
    updateNotificationService: UpdateNotificationService;
  }
}

// Make service available globally
window.updateNotificationService = UpdateNotificationService.getInstance();