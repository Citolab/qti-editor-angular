import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectorRef,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { createEditor, union, type Editor } from 'prosekit/core';
import { buildAssessmentItemXml } from '@qti-editor/core';
import {
  blockSelectExtension,
  defineLocalStorageDocPersistenceExtension,
  defineSemanticPasteExtension,
  nodeAttrsSyncExtension,
  readPersistedStateFromLocalStorage,
} from '@qti-editor/prosemirror';

import '../components/editor/ui/button/index.js';
import '../components/editor/ui/image-upload-popover/index.js';
import '../components/editor/ui/slash-menu/index.js';
import '../components/editor/ui/toolbar/index.js';
import { sampleUploader } from '../components/editor/sample/sample-uploader';
import '../components/blocks/composer/index';
import '../components/blocks/composer-metadata-form/index';
import '../components/blocks/attributes-panel/index';
import '../components/blocks/interaction-insert-menu/index';
import '../components/blocks/convert-menu/index';
import {
  onQtiContentChange,
  onQtiSelectionChange,
  qtiEditorEventsExtension,
  type QtiContentChangeEventDetail,
  type QtiSelectionChangeEventDetail,
} from '../lib/qti-prosekit-integration/events';
import { defineQtiExtension } from '../lib/qti-prosekit-integration/interactions-prosekit';

const STORAGE_KEY = 'qti-editor-angular:prosemirror-doc:v1';
const FILES_STORAGE_KEY = 'qti-editor-angular:saved-files:v1';
const VOID_HTML_TAGS = [
  'img',
  'br',
  'hr',
  'input',
  'meta',
  'link',
  'source',
  'area',
  'col',
  'embed',
  'param',
  'track',
  'wbr',
];

interface SavedFileRecord {
  id: string;
  name: string;
  identifier: string;
  title: string;
  json: QtiContentChangeEventDetail['json'];
  updatedAt: number;
}

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class App implements OnDestroy {
  private _mountEl: HTMLElement | null = null;

  @ViewChild('mount')
  set mountRef(ref: ElementRef<HTMLDivElement> | undefined) {
    const el = ref?.nativeElement ?? null;
    if (el === this._mountEl) return;
    this._mountEl = el;
    if (el) {
      queueMicrotask(() => {
        if (this._mountEl !== el) return;
        this.ngZone.runOutsideAngular(() => this.mountCurrentEditor(el));
      });
    }
  }

  @ViewChild('toolbar', { static: true })
  private readonly toolbarRef?: ElementRef<HTMLElement & {
    editor: Editor | null;
    uploader?: typeof sampleUploader;
  }>;

  @ViewChild('slashMenu', { static: true })
  private readonly slashMenuRef?: ElementRef<HTMLElement & { editor: Editor | null }>;

  @ViewChild('insertMenu', { static: true })
  private readonly insertMenuRef?: ElementRef<HTMLElement & { editor: Editor | null }>;

  @ViewChild('convertMenu', { static: true })
  private readonly convertMenuRef?: ElementRef<HTMLElement & { editor: Editor | null }>;

  @ViewChild('attributesPanel', { static: true })
  private readonly attributesPanelRef?: ElementRef<HTMLElement & { editor: Editor | null }>;

  @ViewChild('composer', { static: true })
  private readonly composerRef?: ElementRef<HTMLElement & { editor: Editor | null; identifier: string; title: string; lang: string }>;

  protected readonly title = 'QTI Editor';
  protected fileName = 'angular-qti-item';
  protected identifier = 'ANGULAR_QTI_ITEM';
  protected itemTitle = 'Angular QTI Item';
  protected content: QtiContentChangeEventDetail | null = null;
  protected selection: QtiSelectionChangeEventDetail | null = null;
  protected xmlPreview = '';
  protected savedFiles: SavedFileRecord[] = [];
  protected currentFileId: string | null = null;
  protected loadMenuOpen = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly ngZone = inject(NgZone);
  private readonly eventTarget = new EventTarget();
  private editor!: Editor;
  private readonly unsubscribeContent: () => void;
  private readonly unsubscribeSelection: () => void;

  constructor() {
    this.savedFiles = this.readSavedFiles();
    this.ngZone.runOutsideAngular(() => this.createEditorInstance());

    this.unsubscribeContent = onQtiContentChange((event) => {
      this.content = event.detail;
      this.updateXmlPreview();
      this.cdr.detectChanges();
    }, this.eventTarget);

    this.unsubscribeSelection = onQtiSelectionChange((event) => {
      this.selection = event.detail;
      this.cdr.detectChanges();
    }, this.eventTarget);

    this.updateXmlPreview();
  }

  ngOnDestroy(): void {
    this.unsubscribeContent();
    this.unsubscribeSelection();
    this.editor.view?.destroy();
  }

  protected exportXml(): void {
    const xml = this.currentXml();
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${this.safeFileName()}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  }

  protected refreshPreview(): void {
    this.updateXmlPreview();
  }

  protected newFile(): void {
    this.currentFileId = null;
    this.fileName = 'angular-qti-item';
    this.identifier = 'ANGULAR_QTI_ITEM';
    this.itemTitle = 'Angular QTI Item';
    window.localStorage.removeItem(STORAGE_KEY);
    this.replaceEditor();
  }

  protected saveFile(): void {
    if (!this.content?.json) return;

    const record: SavedFileRecord = {
      id: this.currentFileId ?? crypto.randomUUID(),
      name: this.fileName.trim() || 'angular-qti-item',
      identifier: this.identifier.trim() || 'ANGULAR_QTI_ITEM',
      title: this.itemTitle.trim() || 'Angular QTI Item',
      json: this.content.json,
      updatedAt: Date.now(),
    };

    this.currentFileId = record.id;
    this.savedFiles = [record, ...this.savedFiles.filter((file) => file.id !== record.id)];
    window.localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(this.savedFiles));
  }

  protected loadFile(fileId: string | null): void {
    if (!fileId) return;

    const file = this.savedFiles.find((entry) => entry.id === fileId);
    if (!file) return;

    this.currentFileId = file.id;
    this.fileName = file.name;
    this.identifier = file.identifier;
    this.itemTitle = file.title;
    this.replaceEditor(file.json);
  }

  protected deleteFile(fileId: string): void {
    this.savedFiles = this.savedFiles.filter((file) => file.id !== fileId);
    window.localStorage.setItem(FILES_STORAGE_KEY, JSON.stringify(this.savedFiles));

    if (this.currentFileId === fileId) {
      this.newFile();
    }
  }

  protected toggleLoadMenu(): void {
    this.loadMenuOpen = !this.loadMenuOpen;
  }

  protected loadFileFromMenu(fileId: string): void {
    this.loadFile(fileId);
    this.loadMenuOpen = false;
  }

  protected deleteFileFromMenu(event: Event, fileId: string): void {
    event.stopPropagation();
    this.deleteFile(fileId);
  }

  protected formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  get fileNameInputWidth(): number {
    return Math.max(80, this.fileName.length * 9);
  }

  protected trackFile(_: number, file: SavedFileRecord): string {
    return file.id;
  }

  protected selectionLabel(): string | null {
    if (!this.selection || this.selection.empty) return null;
    return `${this.selection.from}-${this.selection.to}`;
  }

  protected onMetadataChange(event: Event): void {
    const detail = (event as CustomEvent<{ title: string; identifier: string }>).detail;
    this.itemTitle = detail.title;
    this.identifier = detail.identifier;
    if (this.composerRef) {
      this.composerRef.nativeElement.identifier = this.identifier;
      this.composerRef.nativeElement.title = this.itemTitle;
    }
    this.updateXmlPreview();
  }

  private updateXmlPreview(): void {
    this.xmlPreview = this.currentXml();
  }

  private createEditorInstance(defaultContent?: QtiContentChangeEventDetail['json']): void {
    const extension = union(
      defineQtiExtension(),
      defineSemanticPasteExtension(),
      defineLocalStorageDocPersistenceExtension({ storageKey: STORAGE_KEY }),
      blockSelectExtension,
      nodeAttrsSyncExtension,
      qtiEditorEventsExtension({ eventTarget: this.eventTarget }),
    );

    if (defaultContent) {
      this.editor = createEditor({
        extension,
        defaultContent: defaultContent as unknown as string | Element,
      });
      return;
    }

    const restoredState = readPersistedStateFromLocalStorage(STORAGE_KEY);

    try {
      this.editor = createEditor({
        extension,
        defaultContent: restoredState.doc,
      });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      this.editor = createEditor({ extension });
    }
  }

  private mountCurrentEditor(el: HTMLElement): void {
    el.innerHTML = '';
    this.editor.mount(el);

    queueMicrotask(() => {
      if (this.toolbarRef) {
        this.toolbarRef.nativeElement.editor = this.editor;
        this.toolbarRef.nativeElement.uploader = sampleUploader;
      }
      if (this.slashMenuRef) {
        this.slashMenuRef.nativeElement.editor = this.editor;
      }
      if (this.insertMenuRef) {
        this.insertMenuRef.nativeElement.editor = this.editor;
      }
      if (this.convertMenuRef) {
        this.convertMenuRef.nativeElement.editor = this.editor;
      }
      if (this.attributesPanelRef) {
        this.attributesPanelRef.nativeElement.editor = this.editor;
      }
      if (this.composerRef) {
        this.composerRef.nativeElement.editor = this.editor;
        this.composerRef.nativeElement.identifier = this.identifier;
        this.composerRef.nativeElement.title = this.itemTitle;
        this.composerRef.nativeElement.lang = 'en';
      }
    });
  }

  private replaceEditor(defaultContent?: QtiContentChangeEventDetail['json']): void {
    this.editor.view?.destroy();
    this.content = null;
    this.selection = null;
    this.createEditorInstance(defaultContent);
    if (this._mountEl) {
      this.ngZone.runOutsideAngular(() => this.mountCurrentEditor(this._mountEl!));
    }
    this.updateXmlPreview();
  }

  private currentXml(): string {
    const xmlCompatibleHtml = this.toXmlCompatibleFragment(this.content?.html ?? '');
    const itemBody = new DOMParser().parseFromString(
      `<qti-item-body>${xmlCompatibleHtml}</qti-item-body>`,
      'application/xml',
    );

    return buildAssessmentItemXml({
      identifier: this.identifier.trim() || 'ANGULAR_QTI_ITEM',
      title: this.itemTitle.trim() || 'Angular QTI Item',
      itemBody,
    });
  }

  private safeFileName(): string {
    return (
      this.fileName.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9._-]/g, '') ||
      'angular-qti-item'
    );
  }

  private toXmlCompatibleFragment(sourceHtml: string): string {
    const voidTagPattern = new RegExp(`<(${VOID_HTML_TAGS.join('|')})(\\s[^<>]*?)?>`, 'gi');

    return sourceHtml.replace(/&nbsp;/g, '&#160;').replace(voidTagPattern, (match) => {
      if (match.endsWith('/>')) return match;
      return `${match.slice(0, -1)} />`;
    });
  }

  private readSavedFiles(): SavedFileRecord[] {
    try {
      const raw = window.localStorage.getItem(FILES_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as SavedFileRecord[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
