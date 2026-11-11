import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { MAX_BACKUP_BYTES } from '@/services/backup';
import { pickBackupText, shareBackupFile } from '@/services/backup-files';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

type FakeFile = {
  uri: string;
  size?: number;
  create: jest.Mock;
  write: jest.Mock;
  text: jest.Mock;
  delete: jest.Mock;
};

const fake = (overrides: Partial<FakeFile> = {}): FakeFile => ({
  uri: 'file:///cache/x.json',
  create: jest.fn(),
  write: jest.fn(),
  text: jest.fn().mockResolvedValue('{"a":1}'),
  delete: jest.fn(),
  ...overrides,
});

const useFile = (file: FakeFile) => (File as unknown as jest.Mock).mockImplementationOnce(() => file);
const picked = (size?: number) =>
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/picked.json', size }],
  });

beforeEach(() => {
  jest.clearAllMocks();
  (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
  (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
});

describe('shareBackupFile', () => {
  it('writes, shares with the JSON types, then deletes the file', async () => {
    const file = fake();
    useFile(file);
    await shareBackupFile('spending-backup-2026-11-10.json', 'CONTENT');
    expect(file.write).toHaveBeenCalledWith('CONTENT');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
    });
    expect(file.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes the file when sharing fails', async () => {
    const file = fake();
    useFile(file);
    (Sharing.shareAsync as jest.Mock).mockRejectedValue(new Error('share failed'));
    await expect(shareBackupFile('a.json', 'CONTENT')).rejects.toThrow('share failed');
    expect(file.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes the file when sharing is unavailable, and a failing delete does not hide the result', async () => {
    const file = fake({ delete: jest.fn(() => { throw new Error('nope'); }) });
    useFile(file);
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    await expect(shareBackupFile('a.json', 'CONTENT')).rejects.toThrow('Sharing is not available');
    expect(file.delete).toHaveBeenCalledTimes(1);
  });
});

describe('pickBackupText', () => {
  it('returns null without reading when cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    expect(await pickBackupText()).toBeNull();
    expect(File).not.toHaveBeenCalled();
  });

  it('asks for JSON, text and generic types so .json files show up on Android', async () => {
    picked(10);
    useFile(fake());
    await pickBackupText();
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: ['application/json', 'text/plain', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
  });

  it('reads the text and deletes the picked copy', async () => {
    picked(10);
    const file = fake();
    useFile(file);
    expect(await pickBackupText()).toBe('{"a":1}');
    expect(file.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes the picked copy when reading fails', async () => {
    picked(10);
    const file = fake({ text: jest.fn().mockRejectedValue(new Error('read failed')) });
    useFile(file);
    await expect(pickBackupText()).rejects.toThrow('read failed');
    expect(file.delete).toHaveBeenCalledTimes(1);
  });

  it('refuses a file over 20 MB before reading it, and deletes it', async () => {
    picked(MAX_BACKUP_BYTES + 1);
    const file = fake();
    useFile(file);
    await expect(pickBackupText()).rejects.toMatchObject({ code: 'tooLarge' });
    expect(file.text).not.toHaveBeenCalled();
    expect(file.delete).toHaveBeenCalledTimes(1);
  });

  it('uses the file size when the picker gives none', async () => {
    picked(undefined);
    const file = fake({ size: MAX_BACKUP_BYTES + 5 });
    useFile(file);
    await expect(pickBackupText()).rejects.toMatchObject({ code: 'tooLarge' });
    expect(file.text).not.toHaveBeenCalled();
  });

  it('accepts a file of exactly 20 MB', async () => {
    picked(MAX_BACKUP_BYTES);
    useFile(fake());
    expect(await pickBackupText()).toBe('{"a":1}');
  });
});
