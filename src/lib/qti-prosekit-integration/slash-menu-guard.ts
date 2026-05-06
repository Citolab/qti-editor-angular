import { defineKeymap, defineUpdateHandler, canUseRegexLookbehind, union } from 'prosekit/core';

import type { EditorView } from 'prosekit/pm/view';

const SLASH_REGEX = canUseRegexLookbehind() ? /(?<!\S)\/(\S.*)?$/u : /\/(\S.*)?$/u;

function isInsideInteraction(view: EditorView): boolean {
  const domAtPos = view.domAtPos(view.state.selection.anchor);
  let node: Node | null = domAtPos.node;

  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  while (node && node !== view.dom) {
    if (node instanceof HTMLElement && node.tagName.toLowerCase().endsWith('-interaction')) {
      return true;
    }
    node = node.parentNode;
  }

  return false;
}

export function defineSlashMenuGuardExtension() {
  let wasInside = false;

  return union(
    defineKeymap({
      '/': (state, dispatch, view) => {
        if (!view || !isInsideInteraction(view)) return false;
        dispatch?.(state.tr.insertText('/'));
        return true;
      },
    }),
    defineUpdateHandler((view) => {
      const inside = isInsideInteraction(view);
      if (inside === wasInside) return;
      wasInside = inside;

      const autocompleteRoot = document.querySelector(
        'prosekit-autocomplete-root',
      ) as (HTMLElement & { regex?: RegExp | null }) | null;
      if (autocompleteRoot) {
        autocompleteRoot.regex = inside ? null : SLASH_REGEX;
      }

      const slashMenu = document.querySelector(
        'lit-editor-slash-menu',
      ) as (HTMLElement & { disabled?: boolean }) | null;
      if (slashMenu) {
        slashMenu.disabled = inside;
      }
    }),
  );
}
