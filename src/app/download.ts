/**
 * Hands the browser a file. Backups are the only thing this app ever sends
 * anywhere, and it sends them to the player's own disk.
 */
export type DownloadDeps = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  schedule: (run: () => void, ms: number) => void;
};

/**
 * WebKit reads the object URL asynchronously after the click, so revoking in
 * the same tick cancels the download on Safari and iOS. FileSaver has used a
 * forty second grace period for years; it is long enough for a slow device and
 * short enough that a large vault does not sit in memory for the session.
 */
export const REVOKE_AFTER_MS = 40_000;

const browserDeps: DownloadDeps = {
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  schedule: (run, ms) => void setTimeout(run, ms),
};

export function downloadText(
  filename: string,
  text: string,
  deps: Partial<DownloadDeps> = {},
  type = 'application/json',
): void {
  const { createObjectURL, revokeObjectURL, schedule } = { ...browserDeps, ...deps };

  const url = createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();

  schedule(() => revokeObjectURL(url), REVOKE_AFTER_MS);
}
