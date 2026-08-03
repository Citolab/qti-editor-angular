/**
 * The editor schema — the package's, not a local restatement of it.
 *
 * This file used to spell out the whole topology: every interaction's NodeSpec imported one by one,
 * every `content` and `group` restated inline, 114 lines of it. The comment at the top said that
 * was the point — "the entire document topology is visible in this file" — and that reasoning was
 * sound while the package shipped only the pieces. It no longer does. `createQtiSchema()` composes
 * exactly this: the QTI basics, lists, tables with `richtext` cell content, and every registered
 * interaction, with `doc` carrying `identifier` and `title`.
 *
 * What that readability actually cost, since it was not free:
 *
 *   - `qtiMatchInteractionTabular` was missing. The package registers it; this file never listed
 *     it, so a tabular match in a source item had no node to parse into.
 *   - `qtiLayoutDiv` was a local copy of a spec the package now owns. Two copies of a parse rule
 *     is one copy too many, and the divergence would have been silent — a `<div class="qti-layout-row">`
 *     dropped on import, not an error.
 *   - the image node was `prosemirror-schema-basic`'s, which models `src`/`alt`/`title` and drops
 *     `width` and `height`. The package's carries them.
 *
 * Reading the topology is still possible, and now has one answer rather than two that can disagree:
 * `createQtiSchema` in @citolab/prose-qti/schema.
 *
 * ## The one thing still composed here
 *
 * `prosemirror-image-plugin` rewrites the `image` node spec to add its own node view and upload
 * placeholder handling. That is an editing-experience concern belonging to this app, not to the
 * document format, so it is applied as a last step over the package's schema rather than pushed
 * upstream.
 */

import { Schema } from 'prosemirror-model';
import { defaultSettings, updateImageNode } from 'prosemirror-image-plugin';
import { createQtiSchema } from '@citolab/prose-qti/schema';

export const imagePluginSettings = {
  ...defaultSettings,
  isBlock: false,
  hasTitle: false,
  enableResize: false,
  defaultAlt: 'Image',
};

const qtiSchema = createQtiSchema();

export const appSchema = new Schema({
  marks: qtiSchema.spec.marks,
  nodes: updateImageNode(qtiSchema.spec.nodes, imagePluginSettings),
});
