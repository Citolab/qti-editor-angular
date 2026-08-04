/**
 * QTI integration layer — plugins, attribute allowlist, and the QTI 3.0 item roundtrip.
 *
 * The schema topology is not here and is not in `./schema.ts` either: it comes from
 * `createQtiSchema()` in the package. This module and that one both read the same descriptor
 * registry, which is what keeps the Insert menu and the schema in step — an interaction cannot
 * appear in one and be missing from the other.
 *
 * What this module contributes:
 * - `descriptors`: the package's registry, re-exported for the Insert menu and the two derivations
 *   below.
 * - `qtiPlugins`: the interaction descriptors' own ProseMirror plugins plus the choice-aware
 *   Enter/Backspace keymap. These return false when no interaction applies, so compose them before
 *   the list-split and `baseKeymap` keymaps.
 * - `editableAttrs`: the per-node attribute allowlist for the attributes panel.
 * - `loadQtiItems` / `importQtiItem` / `exportQtiItem`: the QTI 3.0 roundtrip (the import/export
 *   helpers take the composed schema as an argument).
 *
 * It also carries the side-effect imports that register the QTI interaction edit elements (custom
 * elements used by the node views). Those are still listed one by one on purpose: importing a
 * descriptor is a data dependency, but registering a custom element is a side effect on the page,
 * and this app should say out loud which ones it wants defined.
 */

import { chainCommands } from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import { listInteractionDescriptors } from '@citolab/prose-qti/core/interactions/composer';
import { exportItemXml, importItemFromUrl } from '@citolab/prose-qti/item-roundtrip';

import { createChoiceInteractionDecoratorPlugin } from './decorations/choice/qti-choice-interaction.decorator';

import { qtiTransformTest } from '@citolab/prose-qti/transformers';

// Register the interaction edit elements (custom elements used by the views).
import '@citolab/prose-qti/components/choice/register.js';
import '@citolab/prose-qti/components/extended-text/register.js';
import '@citolab/prose-qti/components/text-entry/register.js';
import '@citolab/prose-qti/components/gap-match/register.js';
import '@citolab/prose-qti/components/hottext/register.js';
import '@citolab/prose-qti/components/inline-choice/register.js';
import '@citolab/prose-qti/components/match/register.js';
import '@citolab/prose-qti/components/order/register.js';
import '@citolab/prose-qti/components/select-point/register.js';
import '@citolab/prose-qti/components/shared/components/qti-prompt/register.js';
import '@citolab/prose-qti/components/shared/components/qti-simple-choice/register.js';
import '@citolab/prose-qti/components/shared/components/qti-simple-associable-choice/register.js';
import '@citolab/prose-qti/components/shared/components/qti-simple-match-set/register.js';
import '@citolab/prose-qti/components/shared/components/qti-gap/register.js';
import '@citolab/prose-qti/components/shared/components/qti-gap-text/register.js';

import type { InteractionDescriptor } from '@citolab/prose-qti/interfaces';
import type { Node as ProseMirrorNode, Schema } from 'prosemirror-model';
import type { Plugin } from 'prosemirror-state';

/**
 * Every descriptor the package registers — the same list `createQtiSchema()` builds the schema
 * from, so the editor cannot offer an interaction the schema has no node for, or carry a node no
 * menu can insert.
 *
 * This was a hand-maintained array naming eleven descriptors. It had drifted: the package registers
 * twelve, and the one missing here was `matchInteractionTabular`.
 */
export const descriptors: readonly InteractionDescriptor[] = listInteractionDescriptors();

/** Editable-attribute allowlist for the panel, keyed by node type. Every
 *  attribute outside the listed names is shown disabled by the panel. */
export const editableAttrs = Object.fromEntries(
  descriptors.flatMap(descriptor =>
    Object.values(descriptor.attributePanelMetadata ?? {}).map(metadata => [
      metadata.nodeTypeName,
      metadata.editableAttributes ?? []
    ])
  )
);

/**
 * Enter/Backspace insert or remove a sibling option for whichever interaction the
 * selection is in (choice, inline-choice, …); each tries in turn and returns
 * false when none applies, letting the composition root's list-split and base
 * keymaps take over.
 */
const enterCommand = chainCommands(...descriptors.flatMap(descriptor => descriptor.enterCommand ?? []));
const backspaceCommand = chainCommands(...descriptors.flatMap(descriptor => descriptor.backspaceCommand ?? []));

/**
 * QTI-specific plugins: the interaction-aware Enter/Backspace keymap plus each
 * descriptor's own plugins. The keymap returns false when no interaction handles
 * the key, so compose these *before* the list-split and `keymap(baseKeymap)`
 * keymaps so the QTI overrides win and unhandled keys fall through.
 */
export const qtiPlugins: Plugin[] = [
  keymap({ Enter: enterCommand, Backspace: backspaceCommand }),
  ...descriptors.flatMap(descriptor => descriptor.pluginFactories?.map(factory => factory()) ?? []),
  /*
   * Registered here rather than on the choice descriptor, so it stays exclusive to this app while
   * the design is being validated — a descriptor plugin would reach every host that composes the
   * schema, including the ProseKit apps upstream.
   */
  createChoiceInteractionDecoratorPlugin()
];

const TEST_BASE = 'qti/kennisnet';

/** Load the Kennisnet sample item refs from `AssessmentTest.xml`. */
export async function loadQtiItems(): Promise<{ href: string; identifier: string; category: string }[]> {
  const test = await qtiTransformTest().load(`${TEST_BASE}/AssessmentTest.xml`);
  return test.items().map(item => ({ href: item.href, identifier: item.identifier, category: item.category }));
}

/**
 * Import a QTI 3.0 item from `href` into a ProseMirror document for `schema`.
 *
 * This used to pass an `ensureInteractionPrompts` transform, because the editor's schema required
 * `<qti-prompt>` on interactions that QTI 3.0 marks optional — and ProseMirror's `DOMParser` only
 * inserts *wrapping* parents to recover misplaced children, never a required leading sibling, so a
 * prompt-less interaction in the source closed on its first child and leaked the rest up to the doc
 * level.
 *
 * The requirement was the bug. Synthesising a prompt made a valid QTI item import as a document
 * containing an element its author never wrote, which then exported back out as real markup: the
 * roundtrip added content. Every interaction's content expression now leads with `qtiPrompt?`, so a
 * prompt-less interaction parses as what it is and no transform is needed.
 */
export function importQtiItem(href: string, schema: Schema): Promise<ProseMirrorNode> {
  return importItemFromUrl(href, schema);
}

/** Serialize a ProseMirror document back to a QTI 3.0 item XML string. */
export function exportQtiItem(doc: ProseMirrorNode, schema: Schema): string {
  return exportItemXml(doc, schema);
}
