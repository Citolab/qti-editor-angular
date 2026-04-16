import { html, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { defineMountHandler, union, type Editor, type Extension } from 'prosekit/core';
import { getNodeAttributePanelMetadataByNodeTypeName } from '@qti-editor/core/interactions/composer';
import {
  qtiAttributesExtension,
  qtiSidePanelExtension,
  updateQtiNodeAttrs,
  type QtiAttributesOptions,
  type QtiAttributesTrigger,
  type QtiAttributesTriggerContext,
  type SidePanelEventDetail,
  type SidePanelNodeDetail,
} from '@qti-editor/prosemirror-attributes';
import {
  ProsekitAttributesPanel,
  type AttributeFriendlyEditorDefinition,
  type AttributeFieldDefinition,
  type AttributesNodeDetail,
  type NodeAttributePanelMetadata,
} from '@qti-editor/prosemirror-attributes-ui-prosekit';

import '../choice-attributes-editor/index';
import '../text-entry-attributes-editor/index';
import { type ChoiceInteractionPanelPresentation } from '../choice-attributes-editor/index';
import { type QtiAttributesPatchDetail } from './patch-event';

export interface AttributesPanelExtensionOptions extends QtiAttributesOptions {}

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

@customElement('qti-attributes-panel')
export class QtiAttributesPanel extends ProsekitAttributesPanel {
  @property({ attribute: false })
  choiceInteractionPresentation: ChoiceInteractionPanelPresentation | null = null;

  @property({ attribute: false })
  panelOverrides: AttributePanelOverrides | null = null;

  #editor: Editor | null = null;
  #internalEventTarget = new EventTarget();
  #unregisterExtension: VoidFunction | null = null;

  get editor(): Editor | null {
    return this.#editor;
  }

  set editor(value: Editor | null) {
    if (this.#editor === value) return;
    this.#teardownExtension();
    this.#editor = value;
    this.#setupExtension();
  }

  protected override getEventTarget(): EventTarget {
    return this.#internalEventTarget;
  }

  constructor() {
    super();
    this.eventName = 'qti:attributes:update';
    this.changeEventName = 'qti:attributes:change';
    this.metadataResolver = (nodeType, node) => {
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
    };
  }

  private getPanelOverride(nodeType: string): AttributePanelNodeOverride | null {
    const normalizedNodeType = nodeType.toLowerCase();
    return this.panelOverrides?.[nodeType] ?? this.panelOverrides?.[normalizedNodeType] ?? null;
  }

  private applyPanelOverride(
    panelMetadata: NodeAttributePanelMetadata,
    nodeType: string,
  ): NodeAttributePanelMetadata {
    const override = this.getPanelOverride(nodeType);
    if (!override) return panelMetadata;

    const hiddenAttributes = new Set(panelMetadata.hiddenAttributes ?? []);
    for (const fieldName of override.hiddenAttributes ?? []) hiddenAttributes.add(fieldName);
    for (const fieldName of override.removeFields ?? []) hiddenAttributes.add(fieldName);

    const fields = { ...(panelMetadata.fields ?? {}) };
    for (const fieldName of override.removeFields ?? []) {
      delete fields[fieldName];
    }

    for (const [fieldName, fieldOverride] of Object.entries(override.fields ?? {})) {
      fields[fieldName] = {
        ...(fields[fieldName] ?? { label: fieldName }),
        ...fieldOverride,
      };
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

  private sortAttrEntries(
    entries: Array<[string, any]>,
    fieldOrder: readonly string[] | undefined,
  ): Array<[string, any]> {
    if (!fieldOrder?.length) return entries;

    const orderIndex = new Map(fieldOrder.map((fieldName, index) => [fieldName, index]));
    return [...entries].sort(([a], [b]) => {
      const aIndex = orderIndex.get(a);
      const bIndex = orderIndex.get(b);
      if (aIndex == null && bIndex == null) return 0;
      if (aIndex == null) return 1;
      if (bIndex == null) return -1;
      return aIndex - bIndex;
    });
  }

  #setupExtension() {
    if (!this.#editor) return;

    const ext = union(
      qtiAttributesExtension({ eventTarget: this.#internalEventTarget }),
      defineMountHandler(() => {
        this.editorView = (this.#editor as any).view ?? null;
      }),
    );

    this.#unregisterExtension = this.#editor.use(ext);

    if (this.#editor.mounted) {
      this.editorView = (this.#editor as any).view ?? null;
    }
  }

  #teardownExtension() {
    this.#unregisterExtension?.();
    this.#unregisterExtension = null;
    this.editorView = null;
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#teardownExtension();
  }

  private handleFriendlyEditorPatch(event: CustomEvent<QtiAttributesPatchDetail>) {
    event.stopPropagation();

    const activeNode = this.activeNode;
    const detail = event.detail;
    if (!activeNode || !detail) return;
    if (detail.pos !== activeNode.pos) return;

    this.updateActiveNodeAttrs(detail.attrs as Record<string, any>);
  }

  /**
   * Prevents mousedown from stealing focus and changing editor selection.
   * Only allows focus for interactive elements (inputs, buttons, selects).
   */
  private handlePanelMousedown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const interactiveElements = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'];
    const isInteractive = 
      interactiveElements.includes(target.tagName) ||
      target.closest('input, textarea, select, button, [contenteditable="true"]');
    
    if (!isInteractive) {
      event.preventDefault();
    }
  }

  private renderFriendlyEditor(
    editor: AttributeFriendlyEditorDefinition,
    activeNode: AttributesNodeDetail | null,
  ): TemplateResult | typeof nothing {
    if (!activeNode) return nothing;

    if (editor.kind === 'choiceInteractionClass') {
      return html`
        <qti-choice-attributes-editor
          .activeNode=${activeNode}
          .presentation=${this.choiceInteractionPresentation}
        ></qti-choice-attributes-editor>
      `;
    }

    if (editor.kind === 'textEntryAttributes') {
      return html`<qti-text-entry-attributes-editor .activeNode=${activeNode}></qti-text-entry-attributes-editor>`;
    }

    return nothing;
  }

  protected override renderPanel(): TemplateResult {
    const activeNode = this.activeNode;
    const panelMetadata = this.getPanelMetadata(activeNode);
    const nodeOverride = activeNode ? this.getPanelOverride(activeNode.type) : null;
    const friendlyEditors = panelMetadata?.friendlyEditors ?? [];
    const { editable, readOnly } = this.getAttrEntriesByEditability(activeNode);
    const sortedEditable = this.sortAttrEntries(editable, nodeOverride?.fieldOrder);
    const sortedReadOnly = this.sortAttrEntries(readOnly, nodeOverride?.fieldOrder);
    const friendlyEditorsPlacement = nodeOverride?.friendlyEditorsPlacement ?? 'top';
    const friendlyEditorTemplates = friendlyEditors.map(editor =>
      this.renderFriendlyEditor(editor, activeNode),
    );
    const editableFieldsTemplate = sortedEditable.length
      ? sortedEditable.map(([key, value]) =>
          this.renderField(key, value, this.getFieldMetadata(key, value)),
        )
      : friendlyEditors.length
        ? nothing
        : html`<p class="text-sm text-base-content/70">No editable attributes.</p>`;
    const readOnlyFieldsTemplate = sortedReadOnly.length
      ? html`
          <details class="rounded-lg border border-base-300/50 bg-base-50 p-2">
            <summary class="cursor-pointer text-sm font-medium">
              Read-only attributes (${sortedReadOnly.length})
            </summary>
            <div class="mt-3 flex flex-col gap-3 opacity-80">
              ${sortedReadOnly.map(([key, value]) =>
                this.renderField(key, value, this.getFieldMetadata(key, value), true),
              )}
            </div>
          </details>
        `
      : nothing;

    return html`
      <section
        class="card border border-base-300/50 bg-base-100"
        @qti:attributes:patch=${this.handleFriendlyEditorPatch}
        @mousedown=${this.handlePanelMousedown}
      >
        <div class="card-body gap-3 p-4">
          ${this.renderHeader(activeNode)} ${this.renderNodeSwitcher()}
          <div class="flex flex-col gap-3">
            ${activeNode
              ? html`
                  ${friendlyEditorsPlacement === 'top' ? friendlyEditorTemplates : nothing}
                  ${editableFieldsTemplate}
                  ${friendlyEditorsPlacement === 'bottom' ? friendlyEditorTemplates : nothing}
                  ${readOnlyFieldsTemplate}
                `
              : this.renderEmptyState()}
          </div>
        </div>
      </section>
    `;
  }
}

export function defineExtension(options: AttributesPanelExtensionOptions = {}): Extension {
  return union(
    qtiAttributesExtension({
      eventName: options.eventName ?? 'qti:attributes:update',
      eventTarget: options.eventTarget ?? document,
      eligible: options.eligible,
      trigger: options.trigger,
      onUpdate: options.onUpdate,
    }),
  );
}

export { qtiAttributesExtension, qtiSidePanelExtension, updateQtiNodeAttrs };

export type {
  QtiAttributesOptions,
  QtiAttributesTrigger,
  QtiAttributesTriggerContext,
  SidePanelEventDetail,
  SidePanelNodeDetail,
};
export type { ChoiceInteractionPanelPresentation } from '../choice-attributes-editor/index';

declare global {
  interface HTMLElementTagNameMap {
    'qti-attributes-panel': QtiAttributesPanel;
  }
}
