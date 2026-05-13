import { defineKeymap } from 'prosekit/core';

import type { EditorView } from 'prosekit/pm/view';

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
  return defineKeymap({
    '/': (state, dispatch, view) => {
      if (!view || !isInsideInteraction(view)) return false;
      dispatch?.(state.tr.insertText('/').scrollIntoView());
      return true;
    },
  });
}
