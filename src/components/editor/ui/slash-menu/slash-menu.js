import 'prosekit/lit/autocomplete'

import { html, LitElement } from 'lit';
import { canUseRegexLookbehind } from 'prosekit/core'
import { insertChoiceInteraction } from '@qti-editor/interaction-choice';
import { insertExtendedTextInteraction } from '@qti-editor/interaction-extended-text';
import { insertInlineChoiceInteraction } from '@qti-editor/interaction-inline-choice';
import { insertMatchInteraction } from '@qti-editor/interaction-match';
import { insertOrderInteraction } from '@qti-editor/interaction-order';
import { insertSelectPointInteraction } from '@qti-editor/interaction-select-point';

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

class SlashMenuElement extends LitElement {
  static properties = {
    editor: {
      attribute: false
    },
  };

  createRenderRoot() {
    return this
  }

  getView() {
    return this.editor?.view ?? null
  }

  runCommand = (command) => {
    const view = this.getView()
    if (!view) return
    command(view)
    view.focus()
  };

  insertTextEntry = () => {
    const view = this.getView()
    if (!view) return

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

    return html`<prosekit-autocomplete-popover
      .editor=${editor}
      .regex=${regex}
      class="relative block max-h-100 min-w-60 select-none overflow-auto whitespace-nowrap p-1 z-10 box-border rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-lg [&:not([data-state])]:hidden"
    >
      <prosekit-autocomplete-list .editor=${editor}>
        <div class="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
          Interactions
        </div>

        ${schema?.nodes.qtiChoiceInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Choice interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiChoiceInteraction)}
                @select=${() => this.runCommand((currentView) => insertChoiceInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiInlineChoiceInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Inline choice"
                ?disabled=${!canInsert(view, schema.nodes.qtiInlineChoiceInteraction)}
                @select=${() => this.runCommand((currentView) => insertInlineChoiceInteraction(currentView.state, currentView.dispatch, currentView))}
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
                @select=${() => this.runCommand((currentView) => insertExtendedTextInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiMatchInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Match interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiMatchInteraction)}
                @select=${() => this.runCommand((currentView) => insertMatchInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiOrderInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Order interaction"
                ?disabled=${!canInsert(view, schema.nodes.qtiOrderInteraction)}
                @select=${() => this.runCommand((currentView) => insertOrderInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}
        ${schema?.nodes.qtiSelectPointInteraction
          ? html`
              <lit-editor-slash-menu-item
                class="contents"
                label="Select point"
                ?disabled=${!canInsert(view, schema.nodes.qtiSelectPointInteraction)}
                @select=${() => this.runCommand((currentView) => insertSelectPointInteraction(currentView.state, currentView.dispatch, currentView))}
              ></lit-editor-slash-menu-item>
            `
          : ''}

        <div class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
          Blocks
        </div>
        
        <lit-editor-slash-menu-item
          class="contents"
          label="Text"
          @select=${() => this.runCommand((view) => view.commands.setParagraph())}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Heading 1"
          kbd="#"
          @select=${() => this.runCommand((view) => view.commands.setHeading({ level: 1 }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Heading 2"
          kbd="##"
          @select=${() => this.runCommand((view) => view.commands.setHeading({ level: 2 }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Heading 3"
          kbd="###"
          @select=${() => this.runCommand((view) => view.commands.setHeading({ level: 3 }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Bullet list"
          kbd="-"
          @select=${() => this.runCommand((view) => view.commands.wrapInList({ kind: 'bullet' }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Ordered list"
          kbd="1."
          @select=${() => this.runCommand((view) => view.commands.wrapInList({ kind: 'ordered' }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Task list"
          kbd="[]"
          @select=${() => this.runCommand((view) => view.commands.wrapInList({ kind: 'task' }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Toggle list"
          kbd=">>"
          @select=${() => this.runCommand((view) => view.commands.wrapInList({ kind: 'toggle' }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Quote"
          kbd=">"
          @select=${() => this.runCommand((view) => view.commands.setBlockquote())}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Table"
          @select=${() => this.runCommand((view) => view.commands.insertTable({ row: 3, col: 3 }))}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Divider"
          kbd="---"
          @select=${() => this.runCommand((view) => view.commands.insertHorizontalRule())}
        ></lit-editor-slash-menu-item>
        <lit-editor-slash-menu-item
          class="contents"
          label="Code"
          kbd="\`\`\`"
          @select=${() => this.runCommand((view) => view.commands.setCodeBlock())}
        ></lit-editor-slash-menu-item>

        <lit-editor-slash-menu-empty class="contents"></lit-editor-slash-menu-empty>
      </prosekit-autocomplete-list>
    </prosekit-autocomplete-popover>`;
  }
}

if (!customElements.get('lit-editor-slash-menu')) {
  customElements.define('lit-editor-slash-menu', SlashMenuElement)
}
