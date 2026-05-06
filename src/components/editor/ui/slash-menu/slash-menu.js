import { AutocompleteEmpty, AutocompleteItem, AutocompletePopup, AutocompleteRoot } from 'prosekit/lit/autocomplete'

// prosekit sets sideEffects:false, causing bare imports to be removed by esbuild in
// production builds. Referencing the constructors forces inclusion of the element
// registration code from @prosekit/web/autocomplete (which sets sideEffects:true).
if (!customElements.get('prosekit-autocomplete-root')) customElements.define('prosekit-autocomplete-root', AutocompleteRoot)
if (!customElements.get('prosekit-autocomplete-popup')) customElements.define('prosekit-autocomplete-popup', AutocompletePopup)
if (!customElements.get('prosekit-autocomplete-item')) customElements.define('prosekit-autocomplete-item', AutocompleteItem)
if (!customElements.get('prosekit-autocomplete-empty')) customElements.define('prosekit-autocomplete-empty', AutocompleteEmpty)

import { html, LitElement } from 'lit';
import { canUseRegexLookbehind, defineUpdateHandler } from 'prosekit/core'
import { Selection } from 'prosekit/pm/state'
import { insertChoiceInteraction } from '@qti-editor/interaction-choice';
import { insertExtendedTextInteraction } from '@qti-editor/interaction-extended-text';
import { insertInlineChoiceInteraction } from '@qti-editor/interaction-inline-choice';
import { insertAssociateInteraction } from '@qti-editor/interaction-associate';
import { insertHottextInteraction } from '@qti-editor/interaction-hottext';
import { insertMatchInteraction } from '@qti-editor/interaction-match';
import { insertOrderInteraction } from '@qti-editor/interaction-order';
import { insertSelectPointInteraction } from '@qti-editor/interaction-select-point';
import { insertGapMatchInteraction } from '@qti-editor/interaction-gap-match';
import { insertItemDivider } from '@qti-editor/qti-item-divider';

// Match inputs like "/", "/table", "/heading 1" etc. Do not match "/ heading".
const regex = canUseRegexLookbehind() ? /(?<!\S)\/(\S.*)?$/u : /\/(\S.*)?$/u

function canInsert(view, nodeType) {
  const { $from } = view.state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const index = $from.index(depth);
    if ($from.node(depth).canReplaceWith(index, index, nodeType)) {
      return true;
    }
  }

  return false;
}

function isSelectionInsideNodeType(view, nodeType) {
  const { $from } = view.state.selection;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    if ($from.node(depth).type === nodeType) {
      return true;
    }
  }

  return false;
}

class SlashMenuElement extends LitElement {
  static properties = {
    editor: {
      attribute: false
    },
    disabled: {
      type: Boolean,
      reflect: true,
    },
  };

  removeUpdateExtension;
  lastSelectionJson = null;

  createRenderRoot() {
    return this
  }

  connectedCallback() {
    super.connectedCallback()
    this.attachEditorListener()
  }

  disconnectedCallback() {
    this.detachEditorListener()
    super.disconnectedCallback()
  }

  updated(changedProperties) {
    super.updated(changedProperties)
    if (changedProperties.has('editor')) {
      this.attachEditorListener()
    }
  }

  getView() {
    return this.editor?.view ?? null
  }

  getEditor() {
    return this.editor ?? null
  }

  attachEditorListener() {
    this.detachEditorListener()
    if (!this.editor) return
    this.removeUpdateExtension = this.editor.use(defineUpdateHandler(() => {
      this.snapshotSelection()
      this.requestUpdate()
    }))
    this.snapshotSelection()
  }

  detachEditorListener() {
    this.removeUpdateExtension?.()
    this.removeUpdateExtension = undefined
  }

  snapshotSelection() {
    const view = this.getView()
    if (!view) return
    this.lastSelectionJson = view.state.selection.toJSON()
  }

  restoreSelection() {
    const view = this.getView()
    if (!view || !this.lastSelectionJson) return

    try {
      const restored = Selection.fromJSON(view.state.doc, this.lastSelectionJson)
      view.dispatch(view.state.tr.setSelection(restored))
    } catch {
      return
    }
  }

  runViewCommand = (command) => {
    const view = this.getView()
    if (!view) return
    this.restoreSelection()
    command(view)
    view.focus()
  };

  runEditorCommand = (command) => {
    const editor = this.getEditor()
    const view = this.getView()
    if (!editor || !view) return
    this.restoreSelection()
    command(editor)
    view.focus()
  };

  insertTextEntry = () => {
    const view = this.getView()
    if (!view) return

    this.restoreSelection()

    const nodeType = view.state.schema.nodes.qtiTextEntryInteraction
    if (!nodeType) return

    const node = nodeType.createAndFill({
      responseIdentifier: `RESPONSE_${crypto.randomUUID()}`,
    })
    if (!node) return

    view.dispatch(view.state.tr.replaceSelectionWith(node))
    view.focus()
  };

  render() {
    const editor = this.editor
    if (!editor) {
      return html``;
    }

    const view = this.getView()
    const schema = view?.state.schema

    return html`<prosekit-autocomplete-root
      .editor=${editor}
      .regex=${this.disabled ? null : regex}
    >
      <prosekit-autocomplete-positioner class="block overflow-visible w-min h-min z-50 ease-out transition-transform duration-100 motion-reduce:transition-none">
        <prosekit-autocomplete-popup
          .editor=${editor}
          class="box-border origin-[--transform-origin] transition-[opacity,scale] transition-discrete motion-reduce:transition-none data-[state=closed]:duration-150 data-[state=closed]:opacity-0 starting:opacity-0 data-[state=closed]:scale-95 starting:scale-95 duration-40 rounded-xl border border-gray-200 dark:border-gray-800 shadow-lg bg-[canvas] flex flex-col relative max-h-100 min-h-0 min-w-60 select-none overflow-hidden whitespace-nowrap"
        >
        <div class="flex flex-col flex-1 min-h-0 overflow-y-auto p-1 bg-[canvas] overscroll-contain">
        <div class="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 select-none">
          Interactions
        </div>

        ${schema?.nodes.qtiChoiceInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Choice interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiChoiceInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertChoiceInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiInlineChoiceInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Inline choice"
                ?disabled=${isSelectionInsideNodeType(view, schema.nodes.qtiInlineChoiceInteraction) || !canInsert(view, schema.nodes.qtiInlineChoiceInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertInlineChoiceInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiTextEntryInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Text entry"
                ?disabled=${!canInsert(view, schema.nodes.qtiTextEntryInteraction)}
                @select=${this.insertTextEntry}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiExtendedTextInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Extended text"
                ?disabled=${!canInsert(view, schema.nodes.qtiExtendedTextInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertExtendedTextInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiGapMatchInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Gap match interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiGapMatchInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertGapMatchInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiItemDivider
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Item divider"
                ?disabled=${!canInsert(view, schema.nodes.qtiItemDivider)}
                @select=${() => this.runViewCommand((currentView) => insertItemDivider(currentView.state, currentView.dispatch))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiMatchInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Match interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiMatchInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertMatchInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiAssociateInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Associate interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiAssociateInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertAssociateInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiOrderInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Order interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiOrderInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertOrderInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiHottextInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Hottext interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiHottextInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertHottextInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiSelectPointInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Select point"
                ?disabled=${!canInsert(view, schema.nodes.qtiSelectPointInteraction)}
                @select=${() => this.runViewCommand((currentView) => insertSelectPointInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}

        <div class="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 select-none">
          Blocks
        </div>
        
        <lit-editor-slash-menu-item
          class="contents"
          label="Text"
          @select=${() => this.runEditorCommand((editor) => editor.commands.setParagraph())}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Heading 1"
          kbd="#"
          @select=${() => this.runEditorCommand((editor) => editor.commands.setHeading({ level: 1 }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Heading 2"
          kbd="##"
          @select=${() => this.runEditorCommand((editor) => editor.commands.setHeading({ level: 2 }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Heading 3"
          kbd="###"
          @select=${() => this.runEditorCommand((editor) => editor.commands.setHeading({ level: 3 }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Bullet list"
          kbd="-"
          @select=${() => this.runEditorCommand((editor) => editor.commands.wrapInList({ kind: 'bullet' }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Ordered list"
          kbd="1."
          @select=${() => this.runEditorCommand((editor) => editor.commands.wrapInList({ kind: 'ordered' }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Task list"
          kbd="[]"
          @select=${() => this.runEditorCommand((editor) => editor.commands.wrapInList({ kind: 'task' }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Toggle list"
          kbd=">>"
          @select=${() => this.runEditorCommand((editor) => editor.commands.wrapInList({ kind: 'toggle' }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Quote"
          kbd=">"
          @select=${() => this.runEditorCommand((editor) => editor.commands.setBlockquote())}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Table"
          @select=${() => this.runEditorCommand((editor) => editor.commands.insertTable({ row: 3, col: 3 }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Divider"
          kbd="---"
          @select=${() => this.runEditorCommand((editor) => editor.commands.insertHorizontalRule())}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Code"
          kbd="\`\`\`"
          @select=${() => this.runEditorCommand((editor) => editor.commands.setCodeBlock())}
        ></lit-editor-slash-menu-item>

        <lit-editor-slash-menu-empty class="contents"></lit-editor-slash-menu-empty>
          </div>
        </prosekit-autocomplete-popup>
      </prosekit-autocomplete-positioner>
    </prosekit-autocomplete-root>`;
  }
}

if (!customElements.get('lit-editor-slash-menu')) {
  customElements.define('lit-editor-slash-menu', SlashMenuElement)
}
