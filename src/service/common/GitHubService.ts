import { Utils } from '../../utils/Utils.js';

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  prerelease: boolean;
  published_at: string;
  assets: GitHubAsset[];
}

export interface GitHubAsset {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  content_type: string;
  digest?: string; // this is the checksum
}

export interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  release?: GitHubRelease;
}

export class GitHubService {
  private readonly API_BASE = 'https://api.github.com/repos/activebook/everetch/releases';
  private readonly OWNER = 'activebook';
  private readonly REPO = 'everetch';
  private readonly RATE_LIMIT_DELAY = 1000; // 1 second between requests
  private lastRequestTime = 0;
  private abortController: AbortController | null = null;

  constructor() {
    Utils.logToFile('🔗 GitHubService: Initialized');
  }

  /**
   * Get the latest release from GitHub
   */
  async getLatestRelease(): Promise<GitHubRelease> {
    await this.enforceRateLimit();

    const url = `${this.API_BASE}/latest`;
    Utils.logToFile(`🔗 GitHubService: Fetching latest release from ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EverEtch-AutoUpdater/1.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const release: GitHubRelease = await response.json();
      Utils.logToFile(`✅ GitHubService: Latest release: ${release.tag_name}`);
      return release;
    } catch (error) {
      Utils.logToFile(`❌ GitHubService: Failed to fetch latest release: ${error}`);
      throw error;
    }
  }

  /**
   * Get a specific release by tag name
   */
  async getReleaseByTag(tag: string): Promise<GitHubRelease> {
    await this.enforceRateLimit();

    const url = `${this.API_BASE}/tags/${tag}`;
    Utils.logToFile(`🔗 GitHubService: Fetching release ${tag} from ${url}`);

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'EverEtch-AutoUpdater/1.0',
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
      }

      const release: GitHubRelease = await response.json();
      Utils.logToFile(`✅ GitHubService: Found release: ${release.tag_name}`);
      return release;
    } catch (error) {
      Utils.logToFile(`❌ GitHubService: Failed to fetch release ${tag}: ${error}`);
      throw error;
    }
  }

  /**
   * Download a release asset with progress tracking and cancellation support
   */
  async downloadAsset(
    asset: GitHubAsset,
    onProgress?: (progress: { downloaded: number; total: number; }) => void
  ): Promise<Buffer|null> {
    Utils.logToFile(`⬇️ GitHubService: Downloading asset: ${asset.name} (${asset.size} bytes)`);

    try {
      // Create AbortController for cancellation support
      this.abortController = new AbortController();
      
      const response = await fetch(asset.browser_download_url, {
        headers: {
          'User-Agent': 'EverEtch-AutoUpdater/1.0',
          'Accept': 'application/octet-stream'
        }
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0');
      const totalBytes = contentLength || asset.size;
      let downloadedBytes = 0;
      const chunks: Buffer[] = [];

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        // Check for abort signal after each chunk
        if (this.abortController.signal?.aborted) {
          Utils.logToFile('🛑 GitHubService: Download aborted by user');
          return null; // Exit if aborted
        }

        chunks.push(Buffer.from(value));
        downloadedBytes += value.length;

        // Report progress
        if (onProgress && totalBytes > 0) {
          const percentage = Math.round((downloadedBytes / totalBytes) * 100);
          onProgress({
            downloaded: downloadedBytes,
            total: totalBytes
          });
        }
      }

      const buffer = Buffer.concat(chunks);
      Utils.logToFile(`✅ GitHubService: Downloaded ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      Utils.logToFile(`❌ GitHubService: Download failed: ${error}`);
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Cancel ongoing download processing
   */
  cancelDownloadAsset(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  /**
   * Compare current version with latest version
   */
  async compareVersions(currentVersion: string, latestVersion: string): Promise<boolean> {
    try {
      const current = this.parseVersion(currentVersion);
      const latest = this.parseVersion(latestVersion);
      return this.isNewerVersion(current, latest);
    } catch (error) {
      Utils.logToFile(`❌ GitHubService: Version comparison failed: ${error}`);
      return false;
    }
  }

  /**
   * Get version information including update availability
   */
  async getRemoteVersionInfo(currentVersion: string): Promise<VersionInfo> {
    try {
      const release = await this.getLatestRelease();
      const hasUpdate = await this.compareVersions(currentVersion, release.tag_name);

      return {
        current: currentVersion,
        latest: release.tag_name,
        hasUpdate,
        release
      };
    } catch (error) {
      Utils.logToFile(`❌ GitHubService: Failed to get version info: ${error}`);
      return {
        current: currentVersion,
        latest: currentVersion,
        hasUpdate: false
      };
    }
  }

  /**
   * Find the appropriate update asset for the current platform
   */
  findUpdateAsset(release: GitHubRelease): GitHubAsset {
    const platforms = this.getPlatformIdentifiers();
    const platformSet = new Set(platforms.map(p => p.toLowerCase()));
    Utils.logToFile(`🔍 GitHubService: Looking for ${process.platform} asset in ${release.assets.length} assets`);

    // Look for platform-specific assets using the pre-built set for fast lookup
    for (const asset of release.assets) {
      const assetName = asset.name.toLowerCase();
      // Check if any platform identifier from the set is in the asset name
      for (const platform of platformSet) {
        if (assetName.includes(platform)) {
          Utils.logToFile(`✅ GitHubService: Found matching asset: ${asset.name}`);
          return asset;
        }
      }
    }

    throw new Error(`No suitable asset found for platform: ${process.platform}`);
  }

  /**
   * Get platform identifier for asset matching
   */
  private getPlatformIdentifiers(): string[] {
    switch (process.platform) {
      case 'darwin':
        if (process.arch === 'arm64') {
          return ['darwin-arm64', 'darwin-universal', 'mac'];
        } else {
          return ['darwin-x64', 'darwin-x86_64', 'darwin-universal', 'mac']; 
        }
      case 'win32':
        if (process.arch === 'x64') {
          return ['win32-x64', 'win32-x86_64', 'Windows-x64', 'Windows-x86_64', 'Windows'];
        } else if (process.arch === 'arm64') {
          return ['win32-arm64', 'Windows-arm64'];
        } else {
          return ['win32-ia32', 'win32-i386', 'Windows_i386', 'Windows'];
        }
      case 'linux':
        if (process.arch === 'x64') {
          return ['linux-x64', 'linux-x86_64', 'linux'];
        } else if (process.arch === 'arm64') {
          return ['linux-arm64', 'linux'];
        } else if (process.arch === 'arm') {
          return ['linux-arm', 'linux'];
        } else {
          return ['linux-i386', 'linux'];
        }
      default:
        Utils.logToFile(`⚠️ GitHubService: Unsupported platform ${process.platform} with arch ${process.arch}`);
        // Try to provide some fallback identifiers based on architecture
        switch (process.arch) {
          case 'x64':
            return ['x64', 'x86_64'];
          case 'arm64':
            return ['arm64'];
          case 'arm':
            return ['arm'];
          case 'ia32':
            return ['i386', 'i686'];
          default:
            return [process.arch];
        }
    }
  }

  /**
   * Parse version string into comparable components
   */
  private parseVersion(version: string): { major: number; minor: number; patch: number; pre?: string } {
    // Remove 'v' prefix if present
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

    // Match semantic version pattern
    const match = cleanVersion.match(/^(\d+)\.(\d+)\.(\d+)(?:-([^+]+))?/);
    if (!match) {
      throw new Error(`Invalid version format: ${version}`);
    }

    return {
      major: parseInt(match[1], 10),
      minor: parseInt(match[2], 10),
      patch: parseInt(match[3], 10),
      pre: match[4]
    };
  }

  /**
   * Compare two version objects
   */
  private isNewerVersion(current: any, latest: any): boolean {
    if (latest.major > current.major) return true;
    if (latest.major < current.major) return false;

    if (latest.minor > current.minor) return true;
    if (latest.minor < current.minor) return false;

    if (latest.patch > current.patch) return true;
    if (latest.patch < current.patch) return false;

    // Handle pre-release versions
    if (current.pre && !latest.pre) return true; // latest is stable, current is pre
    if (!current.pre && latest.pre) return false; // current is stable, latest is pre

    return false; // Same version
  }

  /**
   * Enforce rate limiting for GitHub API
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      const waitTime = this.RATE_LIMIT_DELAY - timeSinceLastRequest;
      Utils.logToFile(`⏳ GitHubService: Rate limiting - waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }
}