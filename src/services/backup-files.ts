// The native file side of backups: writing the export, the share sheet and the
// file picker. The database side is in backup.ts. The backup holds all the
// user's financial data, so its cache copies are deleted as soon as they have
// been used, and its content is never logged.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { BackupError, MAX_BACKUP_BYTES } from './backup';

// Best effort: a failed delete must never hide the real result.
function discard(file: File): void {
  try {
    file.delete();
  } catch {
    // Leftover cache files are cleared by the system.
  }
}

// Writes the file to the cache and opens the share sheet, then deletes the
// file. Closing the sheet without sharing is not an error (shareAsync resolves).
export async function shareBackupFile(fileName: string, content: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  try {
    file.create({ overwrite: true });
    file.write(content);
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
    });
  } finally {
    discard(file);
  }
}

// Lets the user pick a file and returns its text, or null when the picker was
// cancelled. A file over the size limit is refused (BackupError 'tooLarge')
// before it is read. The picked copy in the cache is deleted afterwards. The
// content is validated later; the extra types only make .json files show up on
// Android, where they are often reported as text or a generic type.
export async function pickBackupText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  const file = new File(asset.uri);
  try {
    const size = asset.size ?? file.size;
    if (typeof size === 'number' && size > MAX_BACKUP_BYTES) throw new BackupError('tooLarge');
    return await file.text();
  } finally {
    discard(file);
  }
}
