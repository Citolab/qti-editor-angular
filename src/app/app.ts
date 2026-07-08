import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  ViewEncapsulation,
  inject,
  signal,
} from '@angular/core';

import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark, chainCommands } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import {
  menuBar,
  MenuItem,
  Dropdown,
  liftItem,
  selectParentNodeItem,
  undoItem,
  redoItem,
  icons,
  type IconSpec,
  type MenuElement,
} from 'prosemirror-menu';
import { splitListItem, liftListItem, sinkListItem, wrapInList } from 'prosemirror-schema-list';
import {
  tableEditing,
  columnResizing,
  goToNextCell,
  addRowAfter,
  addColumnAfter,
  deleteRow,
  deleteColumn,
  deleteTable,
} from 'prosemirror-tables';
import { imagePlugin, startImageUpload } from 'prosemirror-image-plugin';
import { blockSelectPlugin, nodeAttrsSyncPlugin } from '@citolab/prose-extensions/prosemirror';

import { attributesPanelPlugin } from './editor/components/attributes-panel-plugin';
import {
  descriptors,
  editableAttrs,
  qtiPlugins,
  loadQtiItems,
  importQtiItem,
  exportQtiItem,
} from './editor/prosemirror-qti';
import { appSchema as schema, imagePluginSettings } from './editor/schema';
import { divLockPlugin } from './editor/components/qti-layout-div';
import { textEntryWidgetPlugin } from './editor/components/text-entry-widget';

import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-gapcursor/style/gapcursor.css';
import 'prosemirror-menu/style/menu.css';
import 'prosemirror-tables/style/tables.css';
import 'prosemirror-image-plugin/dist/styles/common.css';
import 'prosemirror-image-plugin/dist/styles/withoutResize.css';

import type { MarkType, Node as ProseMirrorNode } from 'prosemirror-model';
import type { Command } from 'prosemirror-state';
import type { Plugin } from 'prosemirror-state';

/** Standard ProseMirror list & table editing plugins (not QTI-specific). */
const tableListPlugins: Plugin[] = [
  keymap({
    Enter: splitListItem(schema.nodes['list_item']),
    Tab: chainCommands(sinkListItem(schema.nodes['list_item']), goToNextCell(1)),
    'Shift-Tab': chainCommands(liftListItem(schema.nodes['list_item']), goToNextCell(-1)),
    'Mod-[': liftListItem(schema.nodes['list_item']),
    'Mod-]': sinkListItem(schema.nodes['list_item']),
  }),
  columnResizing(),
  tableEditing(),
];

/** A mark-toggle menu item that lights up when the mark is active. */
function markItem(markType: MarkType, label: string, title: string): MenuItem {
  return new MenuItem({
    run: toggleMark(markType),
    enable: (state) => !state.selection.empty,
    active: (state) => {
      const { from, $from, to, empty } = state.selection;
      return empty
        ? !!markType.isInSet(state.storedMarks ?? $from.marks())
        : state.doc.rangeHasMark(from, to, markType);
    },
    label,
    title,
  });
}

/** A command-backed menu item (icon-only) that disables itself when the command can't run. */
function cmdItem(command: Command, icon: IconSpec, title: string): MenuItem {
  return new MenuItem({ run: command, enable: (state) => command(state), icon, title });
}

/** Dropdown of every registered interaction (descriptors that have an insert command). */
const insertInteractionDropdown = new Dropdown(
  descriptors.map((descriptor) => {
    const command = descriptor.insertCommand!;
    return new MenuItem({
      run: command,
      enable: (state) => command(state),
      label: descriptor.tagName,
      title: `Insert ${descriptor.tagName} interaction`,
    });
  }),
  { label: 'Insert' },
);

const insertImage: Command = (_state, _dispatch, view) => {
  if (!view) return true;

  const picker = Object.assign(document.createElement('input'), {
    type: 'file',
    accept: 'image/*',
  });

  picker.addEventListener(
    'change',
    () => {
      const file = picker.files?.[0];
      if (!file) return;
      startImageUpload(view, file, imagePluginSettings.defaultAlt, imagePluginSettings, schema);
    },
    { once: true },
  );

  picker.click();
  return true;
};

/** Insert a 3×3 table (first row as header cells) at the selection. */
const insertTable: Command = (state, dispatch) => {
  const { table, table_row, table_cell, table_header } = schema.nodes;
  const cells = (cell: typeof table_cell) => Array.from({ length: 3 }, () => cell.createAndFill()!);
  const rows = [
    table_row.create(null, cells(table_header)),
    table_row.create(null, cells(table_cell)),
    table_row.create(null, cells(table_cell)),
  ];
  if (dispatch) dispatch(state.tr.replaceSelectionWith(table.create(null, rows)).scrollIntoView());
  return true;
};

/** A tiny menu bar: insert dropdown, marks, undo/redo, structural helpers, lists, and tables. */
const menuContent: MenuElement[][] = [
  [insertInteractionDropdown],
  [markItem(schema.marks['strong'], 'B', 'Toggle bold'), markItem(schema.marks['em'], 'i', 'Toggle italic')],
  [undoItem, redoItem],
  [
    cmdItem(wrapInList(schema.nodes['bullet_list']), icons.bulletList, 'Wrap in bullet list'),
    cmdItem(wrapInList(schema.nodes['ordered_list']), icons.orderedList, 'Wrap in ordered list'),
    cmdItem(insertImage, { text: '🖼' }, 'Insert image'),
  ],
  [
    cmdItem(insertTable, { text: '▦' }, 'Insert table'),
    cmdItem(addRowAfter, { text: '≡' }, 'Add row after'),
    cmdItem(addColumnAfter, { text: '⦀' }, 'Add column after'),
    cmdItem(deleteRow, { text: '➖≡' }, 'Delete row'),
    cmdItem(deleteColumn, { text: '➖⦀' }, 'Delete column'),
    cmdItem(deleteTable, { text: '✕' }, 'Delete table'),
  ],
  [liftItem, selectParentNodeItem],
];

/** The plugin stack shared by every editor instance (the attributes panel plugin is added per-mount). */
const editorPlugins: Plugin[] = [
  history(),
  keymap({ 'Mod-z': undo, 'Mod-y': redo, 'Shift-Mod-z': redo }),
  ...qtiPlugins,
  textEntryWidgetPlugin(),
  divLockPlugin,
  imagePlugin(imagePluginSettings),
  ...tableListPlugins,
  keymap(baseKeymap),
  dropCursor(),
  gapCursor(),
  menuBar({ content: menuContent }),
  blockSelectPlugin,
  nodeAttrsSyncPlugin,
];

interface QtiItemRef {
  href: string;
  identifier: string;
  category: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrls: ['./app.css', './editor/qti.css'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App implements OnDestroy {
  protected readonly appTitle = 'QTI Editor';
  protected readonly items = signal<QtiItemRef[]>([]);
  protected readonly hasView = signal(false);

  @ViewChild('editorHost', { static: true })
  private readonly editorHostRef!: ElementRef<HTMLElement>;

  @ViewChild('attributesPanel', { static: true })
  private readonly attributesPanelRef!: ElementRef<HTMLElement>;

  private readonly ngZone = inject(NgZone);
  private view: EditorView | null = null;

  constructor() {
    void this.loadItems();
  }

  ngOnDestroy(): void {
    this.view?.destroy();
  }

  protected async onItemChange(href: string): Promise<void> {
    if (!href) return;
    await this.ngZone.runOutsideAngular(() => this.openItem(href));
  }

  protected onExportXml(): void {
    if (!this.view) return;
    const xml = exportQtiItem(this.view.state.doc, schema);
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: 'item.xml' });
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Encode the current item as base64 and open it in qti.citolab.nl's preview
   * with `?sharedQti=...`. Uses TextEncoder→btoa so non-ASCII characters
   * survive the round-trip.
   */
  protected onOpenPreview(): void {
    if (!this.view) return;
    const xml = exportQtiItem(this.view.state.doc, schema);
    const bytes = new TextEncoder().encode(xml);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const base64 = btoa(binary);
    const url = `https://qti.citolab.nl/preview?sharedQti=${encodeURIComponent(base64)}`;
    window.open(url, '_blank', 'noopener');
  }

  private async loadItems(): Promise<void> {
    const items = await loadQtiItems();
    this.items.set(items);
  }

  private async openItem(href: string): Promise<void> {
    const panelEl = this.attributesPanelRef.nativeElement;
    panelEl.innerHTML = '';

    const doc = await importQtiItem(href, schema);

    this.view?.destroy();
    const hostEl = this.editorHostRef.nativeElement;
    hostEl.innerHTML = '';
    this.view = this.mountEditor(hostEl, doc, panelEl);
    this.hasView.set(true);
  }

  private mountEditor(container: HTMLElement, doc: ProseMirrorNode, panelEl: HTMLElement): EditorView {
    const view = new EditorView(container, {
      state: EditorState.create({
        doc,
        plugins: [...editorPlugins, attributesPanelPlugin(panelEl, { editableAttrs })],
      }),
      dispatchTransaction(tr) {
        view.updateState(view.state.apply(tr));
      },
    });
    return view;
  }
}
