import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { buildAssessmentItemXml } from '@qti-editor/core/composer';
import { createEditor, union, type Editor } from 'prosekit/core';
import { ListDOMSerializer } from 'prosekit/extensions/list';
import { definePlaceholder } from 'prosekit/extensions/placeholder';
import {
  blockSelectExtension,
  defineLocalStorageDocPersistenceExtension,
  defineSemanticPasteExtension,
  nodeAttrsSyncExtension,
  readPersistedStateFromLocalStorage,
} from '@qti-editor/prosemirror';

import '../../../components/editor/ui/button/index.js';
import '../../../components/editor/ui/image-upload-popover/index.js';
import '../../../components/editor/ui/slash-menu/index.js';
import '../../../components/editor/ui/table-handle/index.js';
import '../../../components/editor/ui/toolbar/index.js';
import { sampleUploader } from '../../../components/editor/sample/sample-uploader';
import '../../../components/blocks/composer/index';
import '../../../components/blocks/composer-metadata-form/index';
import '../../../components/blocks/attributes-panel/index';
import '../../../components/blocks/interaction-insert-menu/index';
import '../../../components/blocks/convert-menu/index';
import {
  onQtiContentChange,
  qtiEditorEventsExtension,
  type QtiContentChangeEventDetail,
} from '../../../lib/qti-prosekit-integration/events';
import { defineQtiExtension } from '../../../lib/qti-prosekit-integration/interactions-prosekit';

const STORAGE_KEY = 'qti-editor-angular:prosemirror-doc:v1';

const VOID_HTML_TAGS = [
  'img', 'br', 'hr', 'input', 'meta', 'link',
  'source', 'area', 'col', 'embed', 'param', 'track', 'wbr',
];
const VOID_TAG_PATTERN = new RegExp(`<(${VOID_HTML_TAGS.join('|')})(\\s[^<>]*?)?>`, 'gi');

@Component({
  selector: 'app-editor-host',
  templateUrl: './editor-host.html',
  styleUrl: './editor-host.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditorHostComponent implements OnDestroy {
  readonly identifier = input('ANGULAR_QTI_ITEM');
  readonly itemTitle = input('Angular QTI Item');

  readonly contentChange = output<QtiContentChangeEventDetail>();
  readonly metadataChange = output<{ title: string; identifier: string }>();

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

  @ViewChild('tableHandle', { static: true })
  private readonly tableHandleRef?: ElementRef<HTMLElement & { editor: Editor | null }>;

  @ViewChild('insertMenu', { static: true })
  private readonly insertMenuRef?: ElementRef<HTMLElement & { editor: Editor | null }>;

  @ViewChild('convertMenu', { static: true })
  private readonly convertMenuRef?: ElementRef<HTMLElement & { editor: Editor | null }>;

  @ViewChild('attributesPanel', { static: true })
  private readonly attributesPanelRef?: ElementRef<HTMLElement & { editor: Editor | null }>;

  @ViewChild('composer', { static: true })
  private readonly composerRef?: ElementRef<HTMLElement & {
    editor: Editor | null;
    identifier: string;
    title: string;
    lang: string;
  }>;

  private readonly ngZone = inject(NgZone);
  private readonly eventTarget = new EventTarget();
  private editor!: Editor;
  private readonly unsubscribeContent: () => void;

  constructor() {
    this.ngZone.runOutsideAngular(() => this.createEditorInstance());

    this.unsubscribeContent = onQtiContentChange((event) => {
      this.contentChange.emit(event.detail);
    }, this.eventTarget);

    // Propagate identifier/itemTitle input signal changes to the composer web component.
    // mountCurrentEditor() handles the initial set; this effect handles subsequent changes.
    effect(() => {
      const ref = this.composerRef;
      if (!ref) return;
      ref.nativeElement.identifier = this.identifier();
      ref.nativeElement.title = this.itemTitle();
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeContent();
    this.editor.view?.destroy();
  }

  public replaceEditor(defaultContent?: QtiContentChangeEventDetail['json']): void {
    this.editor.view?.destroy();
    if (!defaultContent) {
      window.localStorage.removeItem(STORAGE_KEY);
    }
    this.createEditorInstance(defaultContent);
    if (this._mountEl) {
      this.ngZone.runOutsideAngular(() => this.mountCurrentEditor(this._mountEl!));
    }
  }

  public generateXml(): string {
    const doc = this.editor?.state?.doc;
    if (!doc) return '';

    try {
      const serializer = ListDOMSerializer.fromSchema(doc.type.schema);
      const fragment = serializer.serializeFragment(doc.content);
      const container = document.createElement('div');
      container.appendChild(fragment);

      const xmlCompatibleHtml = this.toXmlCompatibleFragment(container.innerHTML);
      const itemBody = new DOMParser().parseFromString(
        `<qti-item-body>${xmlCompatibleHtml}</qti-item-body>`,
        'application/xml',
      );

      return buildAssessmentItemXml({
        identifier: this.identifier().trim() || 'ANGULAR_QTI_ITEM',
        title: this.itemTitle().trim() || 'Angular QTI Item',
        itemBody,
      });
    } catch (e) {
      console.error('[QTI Editor] Failed to generate XML:', e);
      throw e;
    }
  }

  protected onMetadataChange(event: Event): void {
    const detail = (event as CustomEvent<{ title: string; identifier: string }>).detail;
    // Update composerRef immediately so the preview reflects the change before
    // the parent's updated inputs propagate back through the signal graph.
    if (this.composerRef) {
      this.composerRef.nativeElement.identifier = detail.identifier;
      this.composerRef.nativeElement.title = detail.title;
    }
    this.metadataChange.emit(detail);
  }

  private createEditorInstance(defaultContent?: QtiContentChangeEventDetail['json']): void {
    const extension = union(
      defineQtiExtension(),
      defineSemanticPasteExtension(),
      defineLocalStorageDocPersistenceExtension({ storageKey: STORAGE_KEY }),
      blockSelectExtension,
      nodeAttrsSyncExtension,
      qtiEditorEventsExtension({ eventTarget: this.eventTarget }),
      definePlaceholder({ placeholder: 'Typ / voor opdrachten', strategy: 'block' }),
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
      this.editor = createEditor({ extension, defaultContent: restoredState.doc });
    } catch (e) {
      console.error('[QTI Editor] Failed to restore persisted editor state, clearing storage:', e);
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
      if (this.tableHandleRef) {
        this.tableHandleRef.nativeElement.editor = this.editor;
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
        this.composerRef.nativeElement.identifier = this.identifier();
        this.composerRef.nativeElement.title = this.itemTitle();
        this.composerRef.nativeElement.lang = 'en';
      }
    });
  }

  private toXmlCompatibleFragment(sourceHtml: string): string {
    return sourceHtml.replace(/&nbsp;/g, '&#160;').replace(VOID_TAG_PATTERN, (match) => {
      if (match.endsWith('/>')) return match;
      return `${match.slice(0, -1)} />`;
    });
  }
}
