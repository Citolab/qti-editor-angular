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
 *
 * ## …and why its markup rules have to be put back
 *
 * `updateImageNode` does not extend the image node, it REPLACES its markup contract:
 *
 *     toDOM     -> ['div', { class: 'imagePluginRoot', 'imageplugin-src': … }]
 *     parseDOM  -> [{ tag: 'div.imagePluginRoot' }]
 *
 * Both halves are wrong for an editor whose document format is QTI. With no `img[src]` rule left,
 * an authored `<img>` has nothing to match and is dropped on import — silently, and it looks like a
 * rendering fault rather than a parsing one, because the browser still fetches the file while the
 * source HTML sits in the temporary parse document. And `toDOM` would write a `<div>` where QTI
 * requires an `<img>`, so an export could not round-trip either.
 *
 * So the plugin's ATTRIBUTES and node view are kept — `align` and `maxWidth` are what its overlay
 * and resize handles read — while `parseDOM` and `toDOM` are restored from the package's spec. The
 * plugin's own rule is kept alongside, after QTI's, so copy/paste of its markup within the editor
 * still resolves.
 *
 * `toDOM` is only consulted for serialisation here: the plugin registers a nodeView for `image`, and
 * a nodeView owns the on-screen rendering regardless of what `toDOM` says. Restoring it therefore
 * changes what is written out, not what is drawn.
 *
 * The trade: `align` and `maxWidth` do not survive a copy/paste that goes out through `<img>` and
 * back. They are view state rather than content, and QTI is the format of record.
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

/** The image as the package defines it: `<img src alt title width height>`, QTI's contract. */
const qtiImageSpec = qtiSchema.spec.nodes.get('image');

/** The same node once the plugin has added its attributes — and taken the markup rules away. */
const pluginNodes = updateImageNode(qtiSchema.spec.nodes, imagePluginSettings);
const pluginImageSpec = pluginNodes.get('image');

if (!qtiImageSpec || !pluginImageSpec) {
  throw new Error('schema.ts: expected an `image` node in the QTI schema before and after updateImageNode');
}

export const appSchema = new Schema({
  marks: qtiSchema.spec.marks,
  nodes: pluginNodes.update('image', {
    ...pluginImageSpec,
    // QTI's rule first; the plugin's kept so its own markup still pastes.
    parseDOM: [...(qtiImageSpec.parseDOM ?? []), ...(pluginImageSpec.parseDOM ?? [])],
    toDOM: qtiImageSpec.toDOM,
  }),
});
