import { AutocompleteEmpty } from 'prosekit/lit/autocomplete'
if (!customElements.get('prosekit-autocomplete-empty')) customElements.define('prosekit-autocomplete-empty', AutocompleteEmpty)

import { html, LitElement } from 'lit'

class SlashMenuEmptyElement extends LitElement {
  createRenderRoot() {
    return this
  }

  render() {
    return html`
      <prosekit-autocomplete-empty class="relative flex items-center justify-between min-w-32 scroll-my-1 rounded-sm px-3 py-1.5 box-border cursor-default select-none whitespace-nowrap outline-hidden data-focused:bg-gray-100 dark:data-focused:bg-gray-800">
        <span>No results</span>
      </prosekit-autocomplete-empty>
    `;
  }
}

if (!customElements.get('lit-editor-slash-menu-empty')) {
  customElements.define('lit-editor-slash-menu-empty', SlashMenuEmptyElement)
}
