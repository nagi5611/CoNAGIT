// src/media/media-pipeline-db.ts
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * SQLite store for media pipeline rows (S3 key–centric).
 */
export class MediaPipelineDb {
  readonly #db: Database.Database;

  constructor(dbPath: string) {
    this.#db = new Database(dbPath);
    this.#db.pragma("journal_mode = WAL");
  }

  /** Apply bundled migration once (idempotent CREATE IF NOT EXISTS). */
  migrate(): void {
    for (const name of ["0005_media_pipeline_objects.sql", "0006_media_pipeline_state_pending_put.sql"]) {
      const sqlPath = join(__dirname, "../../migrations", name);
      const sql = readFileSync(sqlPath, "utf8");
      this.#db.exec(sql);
    }
  }

  /**
   * Record that presigned PUT URLs were issued for this upload pair.
   */
  recordPresignPair(params: {
    uploadId: string;
    videoKey: string;
    thumbKey: string;
    videoContentType: string;
    thumbContentType: string;
  }): void {
    const stmt = this.#db.prepare(`
      INSERT INTO media_pipeline_object (
        upload_id, video_key, thumb_key, state,
        video_content_type, thumb_content_type, updated_at
      ) VALUES (
        @upload_id, @video_key, @thumb_key, 'pending_put',
        @video_content_type, @thumb_content_type, datetime('now')
      )
      ON CONFLICT(thumb_key) DO UPDATE SET
        upload_id = excluded.upload_id,
        video_key = excluded.video_key,
        state = 'pending_put',
        video_content_type = excluded.video_content_type,
        thumb_content_type = excluded.thumb_content_type,
        updated_at = datetime('now')
    `);
    stmt.run({
      upload_id: params.uploadId,
      video_key: params.videoKey,
      thumb_key: params.thumbKey,
      video_content_type: params.videoContentType,
      thumb_content_type: params.thumbContentType,
    });
  }

  /**
   * Mark thumb as processed after R2 write (optional worker hook).
   */
  markR2Written(thumbKey: string, variantKey: string): void {
    const stmt = this.#db.prepare(`
    UPDATE media_pipeline_object
    SET state = 'r2_written', r2_thumb_key = @r2_key, updated_at = datetime('now')
    WHERE thumb_key = @thumb_key
    `);
    stmt.run({ thumb_key: thumbKey, r2_key: variantKey });
  }

  setState(thumbKey: string, state: string): void {
    const stmt = this.#db.prepare(`
      UPDATE media_pipeline_object
      SET state = @state, updated_at = datetime('now')
      WHERE thumb_key = @thumb_key
    `);
    stmt.run({ thumb_key: thumbKey, state });
  }

  markFailed(thumbKey: string, errorCode: string, errorDetail: string): void {
    const stmt = this.#db.prepare(`
      UPDATE media_pipeline_object
      SET state = 'failed', error_code = @error_code, error_detail = @error_detail, updated_at = datetime('now')
      WHERE thumb_key = @thumb_key
    `);
    stmt.run({ thumb_key: thumbKey, error_code: errorCode, error_detail: errorDetail });
  }

  hasRow(thumbKey: string): boolean {
    const row = this.#db
      .prepare(`SELECT 1 AS ok FROM media_pipeline_object WHERE thumb_key = @thumb_key LIMIT 1`)
      .get({ thumb_key: thumbKey }) as { ok: number } | undefined;
    return row !== undefined;
  }

  getState(thumbKey: string): string | undefined {
    const row = this.#db
      .prepare(`SELECT state FROM media_pipeline_object WHERE thumb_key = @thumb_key`)
      .get({ thumb_key: thumbKey }) as { state: string } | undefined;
    return row?.state;
  }

  close(): void {
    this.#db.close();
  }
}
