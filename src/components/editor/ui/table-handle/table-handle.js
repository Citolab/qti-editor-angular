import {
  TableHandleColumnMenuRoot,
  TableHandleColumnMenuTrigger,
  TableHandleColumnPopup,
  TableHandleRoot,
  TableHandleRowMenuRoot,
  TableHandleRowMenuTrigger,
  TableHandleRowPopup,
} from 'prosekit/lit/table-handle'

if (!customElements.get('prosekit-table-handle-root')) customElements.define('prosekit-table-handle-root', TableHandleRoot)
if (!customElements.get('prosekit-table-handle-column-menu-root')) customElements.define('prosekit-table-handle-column-menu-root', TableHandleColumnMenuRoot)
if (!customElements.get('prosekit-table-handle-column-menu-trigger')) customElements.define('prosekit-table-handle-column-menu-trigger', TableHandleColumnMenuTrigger)
if (!customElements.get('prosekit-table-handle-column-popup')) customElements.define('prosekit-table-handle-column-popup', TableHandleColumnPopup)
if (!customElements.get('prosekit-table-handle-row-menu-root')) customElements.define('prosekit-table-handle-row-menu-root', TableHandleRowMenuRoot)
if (!customElements.get('prosekit-table-handle-row-menu-trigger')) customElements.define('prosekit-table-handle-row-menu-trigger', TableHandleRowMenuTrigger)
if (!customElements.get('prosekit-table-handle-row-popup')) customElements.define('prosekit-table-handle-row-popup', TableHandleRowPopup)

import { html, LitElement, nothing } from 'lit'
import { defineUpdateHandler } from 'prosekit/core'

function getTableHandleState(editor) {
  return {
    addTableColumnBefore: editor.commands.addTableColumnBefore
      ? {
          canExec: editor.commands.addTableColumnBefore.canExec(),
          command: () => editor.commands.addTableColumnBefore(),
        }
      : undefined,
    addTableColumnAfter: editor.commands.addTableColumnAfter
      ? {
          canExec: editor.commands.addTableColumnAfter.canExec(),
          command: () => editor.commands.addTableColumnAfter(),
        }
      : undefined,
    deleteCellSelection: editor.commands.deleteCellSelection
      ? {
          canExec: editor.commands.deleteCellSelection.canExec(),
          command: () => editor.commands.deleteCellSelection(),
        }
      : undefined,
    deleteTableColumn: editor.commands.deleteTableColumn
      ? {
          canExec: editor.commands.deleteTableColumn.canExec(),
          command: () => editor.commands.deleteTableColumn(),
        }
      : undefined,
    addTableRowAbove: editor.commands.addTableRowAbove
      ? {
          canExec: editor.commands.addTableRowAbove.canExec(),
          command: () => editor.commands.addTableRowAbove(),
        }
      : undefined,
    addTableRowBelow: editor.commands.addTableRowBelow
      ? {
          canExec: editor.commands.addTableRowBelow.canExec(),
          command: () => editor.commands.addTableRowBelow(),
        }
      : undefined,
    deleteTableRow: editor.commands.deleteTableRow
      ? {
          canExec: editor.commands.deleteTableRow.canExec(),
          command: () => editor.commands.deleteTableRow(),
        }
      : undefined,
  }
}

class LitEditorTableHandle extends LitElement {
  static properties = {
    editor: { attribute: false },
  }

  createRenderRoot() {
    return this
  }

  connectedCallback() {
    super.connectedCallback()
    this.classList.add('contents')
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

  attachEditorListener() {
    this.detachEditorListener()
    if (!this.editor) return
    this.removeUpdateExtension = this.editor.use(defineUpdateHandler(() => this.requestUpdate()))
  }

  detachEditorListener() {
    this.removeUpdateExtension?.()
    this.removeUpdateExtension = undefined
  }

  renderPopoverItem(item, label, shortcut = '') {
    if (!item?.canExec) return nothing

    return html`
      <button
        class="relative min-w-[8rem] scroll-my-1 rounded px-3 py-1.5 flex items-center justify-between gap-8 box-border cursor-default select-none whitespace-nowrap outline-none data-[focused]:bg-gray-100 dark:data-[focused]:bg-gray-800"
        @mousedown=${(event) => event.preventDefault()}
        @click=${item.command}
      >
        <span>${label}</span>
        ${shortcut ? html`<span class="text-xs tracking-widest text-gray-500 dark:text-gray-500">${shortcut}</span>` : nothing}
      </button>
    `
  }

  render() {
    const editor = this.editor
    if (!editor) return nothing

    const state = getTableHandleState(editor)

    return html`
      <prosekit-table-handle-root .editor=${editor} class="contents">
        <prosekit-table-handle-column-menu-root
          .editor=${editor}
          class="flex items-center box-border justify-center h-[1.2em] w-[1.5em] bg-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500/50 dark:text-gray-500/50 translate-y-3 border border-gray-200 dark:border-gray-800 border-solid [&:not([data-state])]:hidden will-change-transform data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:animate-duration-150 data-[state=closed]:animate-duration-200"
        >
          <prosekit-table-handle-column-menu-trigger .editor=${editor}>
            <div class="i-lucide-grip-horizontal h-5 w-5"></div>
          </prosekit-table-handle-column-menu-trigger>
          <prosekit-table-handle-column-popup
            class="relative block max-h-[25rem] min-w-[8rem] select-none overflow-auto whitespace-nowrap p-1 z-10 box-border rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-lg [&:not([data-state])]:hidden"
          >
            ${this.renderPopoverItem(state.addTableColumnBefore, 'Insert Left')}
            ${this.renderPopoverItem(state.addTableColumnAfter, 'Insert Right')}
            ${this.renderPopoverItem(state.deleteCellSelection, 'Clear Contents', 'Del')}
            ${this.renderPopoverItem(state.deleteTableColumn, 'Delete Column')}
          </prosekit-table-handle-column-popup>
        </prosekit-table-handle-column-menu-root>

        <prosekit-table-handle-row-menu-root
          .editor=${editor}
          class="flex items-center box-border justify-center h-[1.5em] w-[1.2em] bg-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-gray-500/50 dark:text-gray-500/50 translate-x-3 border border-gray-200 dark:border-gray-800 border-solid [&:not([data-state])]:hidden will-change-transform data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:animate-duration-150 data-[state=closed]:animate-duration-200"
        >
          <prosekit-table-handle-row-menu-trigger .editor=${editor}>
            <div class="i-lucide-grip-vertical h-5 w-5"></div>
          </prosekit-table-handle-row-menu-trigger>
          <prosekit-table-handle-row-popup
            class="relative block max-h-[25rem] min-w-[8rem] select-none overflow-auto whitespace-nowrap p-1 z-10 box-border rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 shadow-lg [&:not([data-state])]:hidden"
          >
            ${this.renderPopoverItem(state.addTableRowAbove, 'Insert Above')}
            ${this.renderPopoverItem(state.addTableRowBelow, 'Insert Below')}
            ${this.renderPopoverItem(state.deleteCellSelection, 'Clear Contents', 'Del')}
            ${this.renderPopoverItem(state.deleteTableRow, 'Delete Row')}
          </prosekit-table-handle-row-popup>
        </prosekit-table-handle-row-menu-root>
      </prosekit-table-handle-root>
    `
  }
}

if (!customElements.get('lit-editor-table-handle')) {
  customElements.define('lit-editor-table-handle', LitEditorTableHandle)
}
