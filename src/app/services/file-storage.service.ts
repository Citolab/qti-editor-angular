import { Injectable } from '@angular/core';

import type { SavedFileRecord } from '../shared/file-record';

const FILES_STORAGE_KEY = 'qti-editor-angular:saved-files:v1';

@Injectable({ providedIn: 'root' })
export class FileStorageService {
  readSavedFiles(): SavedFileRecord[] {
    try {
      const raw = window.localStorage.getItem(FILES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedFileRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('[QTI Editor] Failed to read saved files from storage:', e);
      return [];
    }
  }

  persistFiles(files: SavedFileRecord[]): void {
    window.localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(files));
  }
}
