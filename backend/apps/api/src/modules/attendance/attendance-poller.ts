import type { AttendanceSyncService, SyncOutcome } from "./attendance-sync-service.js";

export interface AttendancePollerConfig {
  readonly syncService: Pick<AttendanceSyncService, "syncLastPunchData">;
  readonly intervalMs: number;
  readonly log?: (message: string) => void;
}

/**
 * Near-real-time attendance polling through DownloadLastPunchData. The provider documents no
 * webhook or event API, so the CRM polls; the interval is a CRM configuration choice
 * (ETIME_POLL_INTERVAL_MINUTES), not a provider requirement, and provider rate limits are
 * undocumented. The backend had no scheduler, so this is a single in-process interval:
 * runs never overlap (the next tick is skipped while one is running) and a failed run never
 * stops the poller. The timer is unref'd so it never keeps the process alive.
 */
export class AttendancePoller {
  private readonly syncService: AttendancePollerConfig["syncService"];
  private readonly intervalMs: number;
  private readonly log: (message: string) => void;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<SyncOutcome | null> | null = null;

  public constructor(config: AttendancePollerConfig) {
    this.syncService = config.syncService;
    this.intervalMs = config.intervalMs;
    this.log = config.log ?? ((message) => console.log(message));
  }

  public get running(): boolean {
    return this.timer !== null;
  }

  public start(): void {
    if (this.timer) return;
    this.log(`[INFO] e-Time Office attendance polling every ${Math.round(this.intervalMs / 60_000)} minute(s).`);
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref();
    void this.tick();
  }

  /** Stops scheduling and waits for a run in progress, so shutdown never cuts a transaction. */
  public async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.inFlight) await this.inFlight;
  }

  /** One poll. Never throws: failures are recorded by the sync service and logged here. */
  public async tick(): Promise<SyncOutcome | null> {
    if (this.inFlight) return null;
    this.inFlight = this.syncService
      .syncLastPunchData("SCHEDULER")
      .catch((error: unknown) => {
        this.log(`[ERROR] e-Time Office scheduled sync crashed: ${error instanceof Error ? error.name : "unknown error"}.`);
        return null;
      })
      .finally(() => {
        this.inFlight = null;
      });
    return this.inFlight;
  }
}
