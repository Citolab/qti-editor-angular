import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { defineMountHandler, union, type Editor } from 'prosekit/core';
import {
  qtiAttributesExtension,
  updateNodeAttrs,
  type AttributesEventDetail,
  type AttributesNodeDetail,
} from '@qti-editor/prosemirror-attributes';
import { getNodeAttributePanelMetadataByNodeTypeName } from '@qti-editor/core/interactions/composer';
import type {
  AttributeFieldDefinition,
  AttributeFriendlyEditorDefinition,
  NodeAttributePanelMetadata,
} from '@qti-editor/interfaces';
import type { EditorState } from 'prosekit/pm/state';
import { ChoiceAttributesEditorComponent, type ChoiceInteractionPanelPresentation } from './choice-attributes-editor/choice-attributes-editor.component';
import { TextEntryAttributesEditorComponent } from './text-entry-attributes-editor/text-entry-attributes-editor.component';

type AttrValue = string | number | boolean | string[] | null | undefined;
type AttrEntries = Array<[string, AttrValue]>;
type EditorView = { state: EditorState; dispatch: (tr: any) => void };

type AttributePanelSectionPlacement = 'top' | 'bottom';

export interface AttributePanelNodeOverride {
  editableAttributes?: readonly string[];
  hiddenAttributes?: readonly string[];
  removeFields?: readonly string[];
  fieldOrder?: readonly string[];
  fields?: Record<string, Partial<AttributeFieldDefinition>>;
  friendlyEditors?: readonly AttributeFriendlyEditorDefinition[];
  replaceFriendlyEditors?: boolean;
  friendlyEditorsPlacement?: AttributePanelSectionPlacement;
}

export type AttributePanelOverrides = Record<string, AttributePanelNodeOverride>;

@Component({
  selector: 'app-attributes-panel',
  standalone: true,
  imports: [ChoiceAttributesEditorComponent, TextEntryAttributesEditorComponent],
  templateUrl: './attributes-panel.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttributesPanelComponent implements OnDestroy {
  readonly editor = input<Editor | null>(null);
  readonly panelOverrides = input<AttributePanelOverrides | null>(null);
  readonly choiceInteractionPresentation = input<ChoiceInteractionPanelPresentation | null>(null);

  protected readonly nodes = signal<AttributesNodeDetail[]>([]);
  protected readonly selectedIndex = signal(0);
  protected readonly isInteracting = signal(false);

  protected readonly activeNode = computed(() => {
    const nodes = this.nodes();
    const idx = this.selectedIndex();
    if (nodes.length === 0) return null;
    return nodes[Math.min(idx, nodes.length - 1)] ?? null;
  });

  protected readonly panelMetadata = computed(() => {
    const node = this.activeNode();
    if (!node) return null;
    return this.resolveMetadata(node.type, node);
  });

  protected readonly activeNodeOverride = computed(() => {
    const node = this.activeNode();
    if (!node) return null;
    return this.getPanelOverride(node.type);
  });

  protected readonly attrEntries = computed(() => this.computeAttrEntries());

  protected readonly sortedEditableEntries = computed(() => {
    const { editable } = this.attrEntries();
    return this.sortAttrEntries(editable, this.activeNodeOverride()?.fieldOrder);
  });

  protected readonly sortedReadOnlyEntries = computed(() => {
    const { readOnly } = this.attrEntries();
    return this.sortAttrEntries(readOnly, this.activeNodeOverride()?.fieldOrder);
  });

  protected readonly friendlyEditors = computed(
    () => (this.panelMetadata()?.friendlyEditors ?? []) as AttributeFriendlyEditorDefinition[],
  );

  protected readonly friendlyEditorsPlacement = computed(
    () => this.activeNodeOverride()?.friendlyEditorsPlacement ?? 'top',
  );

  private readonly internalEventTarget = new EventTarget();
  private unregisterExtension: VoidFunction | null = null;
  private editorView: EditorView | null = null;

  private readonly ngZone = inject(NgZone);
  private readonly elementRef = inject(ElementRef);

  constructor() {
    effect(() => {
      const editor = this.editor();
      this.ngZone.runOutsideAngular(() => {
        this.teardownExtension();
        if (editor) this.setupExtension(editor);
      });
    });

    this.ngZone.runOutsideAngular(() => {
      this.internalEventTarget.addEventListener('qti:attributes:update', this.onUpdateEvent);
    });
  }

  ngOnDestroy(): void {
    this.teardownExtension();
    this.ngZone.runOutsideAngular(() => {
      this.internalEventTarget.removeEventListener('qti:attributes:update', this.onUpdateEvent);
    });
  }

  @HostListener('focusin')
  onFocusIn(): void {
    this.isInteracting.set(true);
  }

  @HostListener('focusout', ['$event'])
  onFocusOut(event: FocusEvent): void {
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (!relatedTarget || !this.elementRef.nativeElement.contains(relatedTarget)) {
      this.isInteracting.set(false);
    }
  }

  @HostListener('mousedown', ['$event'])
  onMousedown(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const isInteractive =
      ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName) ||
      !!target.closest('input, textarea, select, button, [contenteditable="true"]');
    if (!isInteractive) {
      event.preventDefault();
    }
  }

  protected setSelectedNode(index: number): void {
    this.selectedIndex.set(index);
  }

  protected getFieldMetadata(key: string, value: AttrValue): AttributeFieldDefinition {
    const metadata = this.panelMetadata();
    const fieldMetadata = metadata?.fields?.[key] ?? {};
    const inferredInput =
      fieldMetadata.input ??
      (fieldMetadata.options?.length
        ? 'select'
        : typeof value === 'boolean'
          ? 'checkbox'
          : typeof value === 'number'
            ? 'number'
            : 'text');
    return { ...fieldMetadata, input: inferredInput };
  }

  protected handleFieldChange(attrKey: string, originalValue: AttrValue, event: Event): void {
    const input = event.currentTarget as HTMLInputElement | HTMLSelectElement;
    const nextValue = this.coerceValue(input, originalValue);
    this.updateActiveNodeAttrs({ [attrKey]: nextValue });
  }

  protected handlePatch(event: { pos: number; attrs: Record<string, unknown> }): void {
    const activeNode = this.activeNode();
    if (!activeNode || event.pos !== activeNode.pos) return;
    this.updateActiveNodeAttrs(event.attrs as Record<string, AttrValue>);
  }

  protected isChoiceEditor(editor: AttributeFriendlyEditorDefinition): boolean {
    return editor.kind === 'choiceInteractionClass';
  }

  protected isTextEntryEditor(editor: AttributeFriendlyEditorDefinition): boolean {
    return editor.kind === 'textEntryAttributes';
  }

  private readonly onUpdateEvent = (event: Event): void => {
    if (this.isInteracting()) return;

    const detail = (event as CustomEvent<AttributesEventDetail>).detail;
    const currentNodes = this.nodes();
    const previousActiveNode = this.activeNode();
    const newNodes = Array.isArray(detail?.nodes) ? detail.nodes : [];
    const requestedNode = detail?.activeNode;

    if (
      this.areNodeListsEquivalent(currentNodes, newNodes) &&
      this.isSameNode(previousActiveNode, requestedNode)
    ) {
      return;
    }

    const preservedIndex =
      previousActiveNode != null
        ? newNodes.findIndex(
            n => n.pos === previousActiveNode.pos && n.type === previousActiveNode.type,
          )
        : -1;
    const requestedIndex = requestedNode
      ? newNodes.findIndex(
          n => n.pos === requestedNode.pos && n.type === requestedNode.type,
        )
      : -1;

    this.nodes.set(newNodes);

    if (requestedIndex >= 0) {
      this.selectedIndex.set(requestedIndex);
    } else if (preservedIndex >= 0) {
      this.selectedIndex.set(preservedIndex);
    } else {
      const currentIdx = this.selectedIndex();
      if (currentIdx >= newNodes.length) {
        this.selectedIndex.set(0);
      }
    }
  };

  private setupExtension(editor: Editor): void {
    const ext = union(
      qtiAttributesExtension({ eventTarget: this.internalEventTarget }),
      defineMountHandler(() => {
        this.editorView = (editor as any).view ?? null;
      }),
    );
    this.unregisterExtension = editor.use(ext);
    if ((editor as any).mounted) {
      this.editorView = (editor as any).view ?? null;
    }
  }

  private teardownExtension(): void {
    this.unregisterExtension?.();
    this.unregisterExtension = null;
    this.editorView = null;
  }

  private updateActiveNodeAttrs(attrs: Record<string, AttrValue>): void {
    const node = this.activeNode();
    if (!node) return;
    const nextAttrs = { ...node.attrs, ...attrs };
    const idx = this.selectedIndex();
    this.nodes.update(nodes =>
      nodes.map((item, i) => (i === idx ? { ...item, attrs: nextAttrs } : item)),
    );
    if (this.editorView) {
      updateNodeAttrs(this.editorView, node.pos, nextAttrs);
    }
  }

  private coerceValue(input: HTMLInputElement | HTMLSelectElement, originalValue: AttrValue): AttrValue {
    if (input instanceof HTMLInputElement && input.type === 'checkbox') return input.checked;
    if (typeof originalValue === 'number') return input.value === '' ? null : Number(input.value);
    if (input.value === '') return null;
    return input.value;
  }

  private resolveMetadata(nodeType: string, node: AttributesNodeDetail): NodeAttributePanelMetadata | null {
    const metadata = getNodeAttributePanelMetadataByNodeTypeName(nodeType);
    if (!metadata) return null;

    const fields: NodeAttributePanelMetadata['fields'] = {};
    for (const key of Object.keys(node.attrs ?? {})) {
      fields[key] = { label: key };
    }

    const panelMetadata: NodeAttributePanelMetadata = {
      nodeTypeName: metadata.nodeTypeName,
      editableAttributes: [...(metadata.editableAttributes ?? [])],
      hiddenAttributes: [...(metadata.hiddenAttributes ?? [])],
      friendlyEditors: (metadata.friendlyEditors ?? []) as AttributeFriendlyEditorDefinition[],
      fields,
    };

    return this.applyPanelOverride(panelMetadata, nodeType);
  }

  private getPanelOverride(nodeType: string): AttributePanelNodeOverride | null {
    const overrides = this.panelOverrides();
    const normalized = nodeType.toLowerCase();
    return overrides?.[nodeType] ?? overrides?.[normalized] ?? null;
  }

  private applyPanelOverride(
    panelMetadata: NodeAttributePanelMetadata,
    nodeType: string,
  ): NodeAttributePanelMetadata {
    const override = this.getPanelOverride(nodeType);
    if (!override) return panelMetadata;

    const hiddenAttributes = new Set(panelMetadata.hiddenAttributes ?? []);
    for (const f of override.hiddenAttributes ?? []) hiddenAttributes.add(f);
    for (const f of override.removeFields ?? []) hiddenAttributes.add(f);

    const fields = { ...(panelMetadata.fields ?? {}) };
    for (const f of override.removeFields ?? []) delete fields[f];
    for (const [k, v] of Object.entries(override.fields ?? {})) {
      fields[k] = { ...(fields[k] ?? { label: k }), ...v };
    }

    const baseFriendlyEditors = (panelMetadata.friendlyEditors ?? []) as AttributeFriendlyEditorDefinition[];
    const friendlyEditors = override.replaceFriendlyEditors
      ? [...(override.friendlyEditors ?? [])]
      : [...baseFriendlyEditors, ...(override.friendlyEditors ?? [])];

    return {
      ...panelMetadata,
      editableAttributes: override.editableAttributes
        ? [...override.editableAttributes]
        : panelMetadata.editableAttributes,
      hiddenAttributes: [...hiddenAttributes],
      friendlyEditors,
      fields,
    };
  }

  private computeAttrEntries(): { editable: AttrEntries; readOnly: AttrEntries } {
    const node = this.activeNode();
    if (!node) return { editable: [], readOnly: [] };

    const attrs = node.attrs ?? {};
    const entries = Object.entries(attrs) as AttrEntries;
    const metadata = this.panelMetadata();
    if (!metadata) return { editable: entries, readOnly: [] };

    const editableAttributes = new Set(metadata.editableAttributes ?? entries.map(([k]) => k));
    const hiddenAttributes = new Set(metadata.hiddenAttributes ?? []);

    return {
      editable: entries.filter(([k]) => {
        const field = metadata.fields?.[k];
        return !hiddenAttributes.has(k) && editableAttributes.has(k) && !field?.readOnly;
      }),
      readOnly: entries.filter(([k]) => {
        const field = metadata.fields?.[k];
        return !hiddenAttributes.has(k) && (!editableAttributes.has(k) || Boolean(field?.readOnly));
      }),
    };
  }

  private sortAttrEntries(entries: AttrEntries, fieldOrder: readonly string[] | undefined): AttrEntries {
    if (!fieldOrder?.length) return entries;
    const orderIndex = new Map(fieldOrder.map((f, i) => [f, i]));
    return [...entries].sort(([a], [b]) => {
      const ai = orderIndex.get(a);
      const bi = orderIndex.get(b);
      if (ai == null && bi == null) return 0;
      if (ai == null) return 1;
      if (bi == null) return -1;
      return ai - bi;
    });
  }

  private areNodeListsEquivalent(
    left: AttributesNodeDetail[],
    right: AttributesNodeDetail[],
  ): boolean {
    if (left === right) return true;
    if (left.length !== right.length) return false;

    return left.every((leftNode, index) => {
      const rightNode = right[index];
      return (
        leftNode?.pos === rightNode?.pos &&
        leftNode?.type === rightNode?.type &&
        this.areAttrsEquivalent(leftNode?.attrs ?? {}, rightNode?.attrs ?? {})
      );
    });
  }

  private isSameNode(
    left: AttributesNodeDetail | null,
    right: AttributesNodeDetail | null | undefined,
  ): boolean {
    if (left == null && right == null) return true;
    if (left == null || right == null) return false;
    return left.pos === right.pos && left.type === right.type;
  }

  private areAttrsEquivalent(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
  ): boolean {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key) => this.isSameAttrValue(left[key], right[key]));
  }

  private isSameAttrValue(left: unknown, right: unknown): boolean {
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) return false;
      if (left.length !== right.length) return false;
      return left.every((value, index) => Object.is(value, right[index]));
    }

    return Object.is(left, right);
  }
}
