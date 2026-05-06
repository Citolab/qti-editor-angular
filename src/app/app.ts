import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';

import { EditorHostComponent } from './components/editor-host/editor-host';
import { MenuBarComponent } from './components/menu-bar/menu-bar';
import { ATTRIBUTE_PANEL_OVERRIDES } from './components/attributes-panel/attribute-panel-overrides';
import { FileStorageService } from './services/file-storage.service';
import type { SavedFileRecord } from './shared/file-record';
import type { QtiContentChangeEventDetail } from '../lib/qti-prosekit-integration/events';

@Component({
  selector: 'app-root',
  imports: [MenuBarComponent, EditorHostComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly appTitle = 'QTI Editor';
  protected readonly attributePanelOverrides = ATTRIBUTE_PANEL_OVERRIDES;

  protected readonly fileName = signal('angular-qti-item');
  protected readonly identifier = signal('ANGULAR_QTI_ITEM');
  protected readonly itemTitle = signal('Angular QTI Item');
  protected readonly currentFileId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly content = signal<QtiContentChangeEventDetail | null>(null);
  private readonly fileStorage = inject(FileStorageService);

  protected readonly savedFiles = signal(this.fileStorage.readSavedFiles());

  private readonly safeFileName = computed(() =>
    this.fileName().trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '') ||
    'angular-qti-item',
  );

  @ViewChild(EditorHostComponent)
  private readonly editorHost!: EditorHostComponent;

  protected onNewFile(): void {
    this.currentFileId.set(null);
    this.fileName.set('angular-qti-item');
    this.identifier.set('ANGULAR_QTI_ITEM');
    this.itemTitle.set('Angular QTI Item');
    this.content.set(null);
    this.editorHost.replaceEditor();
  }

  protected onSaveFile(): void {
    const content = this.content();
    if (!content?.json) return;

    const record: SavedFileRecord = {
      id: this.currentFileId() ?? crypto.randomUUID(),
      name: this.fileName().trim() || 'angular-qti-item',
      identifier: this.identifier().trim() || 'ANGULAR_QTI_ITEM',
      title: this.itemTitle().trim() || 'Angular QTI Item',
      json: content.json,
      updatedAt: Date.now(),
    };

    const newFiles = [record, ...this.savedFiles().filter((f) => f.id !== record.id)];

    // Persist first — only update in-memory state if storage succeeds.
    if (!this.tryPersist(newFiles, 'save')) return;

    this.currentFileId.set(record.id);
    this.savedFiles.set(newFiles);
  }

  protected onExportXml(): void {
    let xml: string;
    try {
      xml = this.editorHost.generateXml();
    } catch {
      this.errorMessage.set('Export failed: could not generate XML.');
      return;
    }

    if (!xml) {
      this.errorMessage.set('Export failed: the document is empty.');
      return;
    }

    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.safeFileName()}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected async onImportXml(): Promise<void> {
    try {
      await this.editorHost.importXml();
      this.currentFileId.set(null);
      this.fileName.set('imported-qti-item');
    } catch {
      this.errorMessage.set('Import failed: please choose a valid QTI XML file.');
    }
  }

  protected onLoadFile(fileId: string): void {
    const file = this.savedFiles().find((f) => f.id === fileId);
    if (!file) return;

    this.currentFileId.set(file.id);
    this.fileName.set(file.name);
    this.identifier.set(file.identifier);
    this.itemTitle.set(file.title);
    this.content.set(null);
    this.editorHost.replaceEditor(file.json);
  }

  protected onDeleteFile(fileId: string): void {
    const newFiles = this.savedFiles().filter((f) => f.id !== fileId);

    // Persist first — only update in-memory state if storage succeeds.
    if (!this.tryPersist(newFiles, 'delete')) return;

    this.savedFiles.set(newFiles);

    if (this.currentFileId() === fileId) {
      this.onNewFile();
    }
  }

  protected onContentChange(detail: QtiContentChangeEventDetail): void {
    this.content.set(detail);
  }

  protected onMetadataChange(detail: { title: string; identifier: string }): void {
    this.identifier.set(detail.identifier);
    this.itemTitle.set(detail.title);
  }

  protected dismissError(): void {
    this.errorMessage.set(null);
  }

  /**
   * Attempts to write `files` to storage.
   * Returns `true` on success; sets `errorMessage` and returns `false` on failure.
   * The `action` label is used only in the non-quota error log.
   */
  private tryPersist(files: SavedFileRecord[], action: string): boolean {
    try {
      this.fileStorage.persistFiles(files);
      return true;
    } catch (e) {
      if (e instanceof DOMException) {
        this.errorMessage.set(
          'Could not save: browser storage is full. Delete some files and try again.',
        );
      } else {
        console.error(`[QTI Editor] Failed to persist files (${action}):`, e);
        this.errorMessage.set('Could not save: an unexpected storage error occurred.');
      }
      return false;
    }
  }
}
