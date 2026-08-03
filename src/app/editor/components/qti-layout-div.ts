/**
 * Lock the `qti-layout-*` wrappers in place.
 *
 * QTI items can wrap their body in presentation grids built from
 * `<div class="qti-layout-row">` / `<div class="qti-layout-colN">` wrappers (see
 * `public/qti/kennisnet/ITEM001.xml`). Two things have to be true for those to survive editing:
 * the schema must have a node for them, and the author must not be able to add or remove one.
 *
 * The first now comes from the package. `qtiLayoutDiv` is part of `qtiBasicNodes`, so every schema
 * built with `createQtiSchema()` carries it — including its parse rule, which matches only divs
 * whose class begins with `qti-layout-` and leaves every other `<div>` to the default structural
 * handling. This file used to hold a second copy of that spec. It was identical, which is precisely
 * why it was worth deleting: the day it stopped being identical, the symptom would have been an
 * author's layout silently dropped on import rather than anything that looks like an error.
 *
 * The second is below, and it stays here. Whether an author may restructure the page grid is an
 * editing policy this app has chosen — a different host could reasonably let them — so it does not
 * belong in a shared definition of what a QTI document IS.
 */

import { Plugin } from 'prosemirror-state';

import type { Node as ProseMirrorNode } from 'prosemirror-model';

/** Number of layout divs in the document. */
function layoutCount(doc: ProseMirrorNode): number {
  let count = 0;
  doc.descendants((node) => {
    if (node.type.name === 'qtiLayoutDiv') count += 1;
    return true;
  });
  return count;
}

/**
 * Rejects any transaction that would add or remove a layout div. Transactions that only edit a
 * div's `class` or the content inside the columns keep the same count and pass through, so
 * re-classing and inner editing both keep working.
 */
export const divLockPlugin = new Plugin({
  filterTransaction(tr, state) {
    if (!tr.docChanged) return true;
    return layoutCount(state.doc) === layoutCount(tr.doc);
  },
});
