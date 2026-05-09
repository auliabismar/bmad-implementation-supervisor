import chokidar, { FSWatcher } from "chokidar";
import { getConfig } from "../config";
import { getPlatform } from "../utils/platform";
import { StoryStateMachine } from "./state-machine";
import { logger } from "../utils/logger";

/**
 * StallDetector monitors file changes during workflow execution
 * to detect when a workflow gets stuck due to lack of progress.
 */
export class StallDetector {
  private watcher: FSWatcher | null = null;
  private stallTimeoutMs: number;
  private lastChangeTime: number = Date.now();
  private onStallCallback: (() => void) | null = null;
  private isWatching: boolean = false;
  private fileCount: number = 0;
  private totalSize: number = 0;

  private checkInterval: NodeJS.Timeout | null = null;

  constructor() {
    const config = getConfig();
    this.stallTimeoutMs = config.health.stuck_timeout_ms ?? 600000; // Default 10 minutes
  }

  /**
   * Start monitoring file changes for stall detection
   * @param storyStateMachine Reference to story state machine for workflow lifecycle
   * @param onStall Callback to invoke when stall is detected
   */
  start(storyStateMachine: StoryStateMachine, onStall: () => void): void {
    if (this.isWatching) {
      logger.warn("StallDetector is already watching");
      return;
    }

    this.onStallCallback = onStall;

    storyStateMachine.onWorkflowStarted(() => {
      this.resumeWatching();
    });

    storyStateMachine.onWorkflowEnded(() => {
      this.pauseWatching();
    });

    this.isWatching = true;
  }

  private resumeWatching(): void {
    if (this.watcher) return;
    this.lastChangeTime = Date.now();
    this.fileCount = 0;
    this.totalSize = 0;

    // Watch relevant directories: src/ and story output directories
    const patterns = [
      "src/**/*",
      "_bmad-output/**/*",
      "!node_modules/**",
      "!.git/**",
      "!dist/**",
      "!*.log",
      "!*.sqlite",
    ];

    this.watcher = chokidar.watch(patterns, {
      persistent: true,
      usePolling: getPlatform().isWindows, // Windows needs polling
      ignored: /(^|[\/\\])\.|node_modules/,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100,
      },
    });

    this.watcher.on("all", (event, path) => {
      // Update last change time on any file event
      this.lastChangeTime = Date.now();
      this.updateFingerprint();
    });

    this.watcher.on("ready", () => {
      logger.info("StallDetector started watching for file changes");
      this.updateFingerprint();
      this.startStallCheck();
    });

    this.watcher.on("error", (error) => {
      logger.error(
        `StallDetector watcher error: ${(error as Error).message ?? String(error)}`,
      );
    });
  }

  private pauseWatching(): void {
    if (!this.watcher) return;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.watcher.close();
    this.watcher = null;
    logger.info("StallDetector paused watching");
  }

  /**
   * Stop monitoring file changes
   */
  stop(): void {
    if (!this.isWatching) {
      return;
    }

    this.pauseWatching();
    this.isWatching = false;
    logger.info("StallDetector stopped");
  }

  /**
   * Update file count and total size fingerprint
   */
  private updateFingerprint(): void {
    if (!this.watcher) return;

    try {
      // Get watched files and calculate fingerprint
      const watchedPaths = this.watcher.getWatched();
      let fileCount = 0;
      let totalSize = 0;

      for (const [dir, files] of Object.entries(watchedPaths)) {
        for (const file of files) {
          const fullPath = `${dir}/${file}`;
          try {
            const stats = require("fs").statSync(fullPath);
            if (stats.isFile()) {
              fileCount++;
              totalSize += stats.size;
            }
          } catch (err) {
            // Ignore files that can't be stat'd (may have been deleted)
          }
        }
      }

      this.fileCount = fileCount;
      this.totalSize = totalSize;
      logger.debug(
        `StallDetector fingerprint updated: ${fileCount} files, ${totalSize} bytes`,
      );
    } catch (error) {
      logger.error(`Failed to update stall detector fingerprint: ${(error as Error).message ?? String(error)}`);
    }
  }

  /**
   * Start periodic stall checking
   */
  private startStallCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      if (!this.isWatching) return;

      const timeSinceLastChange = Date.now() - this.lastChangeTime;
      if (timeSinceLastChange >= this.stallTimeoutMs) {
        logger.warn(
          `Stall detected: no file changes for ${timeSinceLastChange}ms (threshold: ${this.stallTimeoutMs}ms)`,
        );
        this.onStallCallback?.();
        // Reset last change time to avoid repeatedly triggering the callback every 30 seconds
        this.lastChangeTime = Date.now();
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Get current progress fingerprint
   */
  getFingerprint(): { fileCount: number; totalSize: number } {
    return {
      fileCount: this.fileCount,
      totalSize: this.totalSize,
    };
  }

  /**
   * Check if detector is currently watching
   */
  isActive(): boolean {
    return this.isWatching;
  }
}

// Export singleton instance
export const stallDetector = new StallDetector();
