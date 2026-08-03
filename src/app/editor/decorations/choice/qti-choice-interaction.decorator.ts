/**
 * QTI Choice Interaction — editor decorations
 *
 * Widget decorations that give the choice interaction its mouse affordances:
 *
 *   ×  per `qtiSimpleChoice`, pinned to the right of the row, revealed on hover
 *   +  below the last choice but inside the interaction, appends a new choice
 *   ⚙  a settings pill above the interaction, emitted only while the selection
 *      sits inside it; clicking dispatches an event so the host app can open
 *      its own properties panel.
 *
 * All three are view-only: they never enter the document, so exported XML is
 * unaffected.
 *
 * `qtiSimpleChoice` is shared with the order interaction, so decorations are
 * produced by walking `qtiChoiceInteraction` nodes and iterating their own
 * children — never by matching `qtiSimpleChoice` globally.
 *
 * ## Ported from qti-editor, deliberately app-local
 *
 * This came from the `choice-decorator` branch of qti-editor, where it sat in
 * packages/prose-qti. It lives in this app instead while the design is being validated: a
 * decoration set is an opinion about how authoring should FEEL, and that is not something the
 * package should impose on every host the way a node spec is. It moves upstream once the shape
 * settles — and the ProseKit apps deliberately do not pick it up before then.
 *
 * `createSimpleChoiceNode` and the three message keys come from the package (1.9.1). Both were
 * briefly duplicated here while this app ran against 1.7.0, which predated them; the factory in
 * particular is worth importing rather than copying, since it is the only thing guaranteeing that a
 * choice added with `+` is structurally identical to one added with Enter.
 */

import { Plugin, PluginKey, TextSelection } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

import { createSimpleChoiceNode } from '@citolab/prose-qti/components/choice';
import { translateQti } from '@citolab/prose-qti/components/shared';

import type { Node as ProseMirrorNode } from 'prosemirror-model';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

/** Fired when the settings pill of an interaction is clicked. */
export const QTI_OPEN_NODE_SETTINGS_EVENT = 'qti:node-settings:open';

export interface QtiOpenNodeSettingsDetail {
  nodeTypeName: string;
  tagName: string;
  /** Document position of the interaction node at the time of the click. */
  pos: number;
  attrs: Record<string, unknown>;
}

const choiceDecoratorPluginKey = new PluginKey('qti-choice-interaction-decorations');

const INTERACTION_NODE_NAME = 'qtiChoiceInteraction';
const INTERACTION_TAG_NAME = 'qti-choice-interaction';
const CHOICE_NODE_NAME = 'qtiSimpleChoice';


/** Lucide-style stroke glyphs, matching the design prototype. */
const ICON_PATHS = {
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  sliders:
    '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/>',
} as const;

function createIcon(name: keyof typeof ICON_PATHS, size: number): SVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICON_PATHS[name];
  return svg;
}

type DecorationButtonOptions = {
  modifier: 'remove' | 'add' | 'settings';
  icon: keyof typeof ICON_PATHS;
  iconSize: number;
  label: string;
  /** Rendered next to the icon; the settings pill is the only labelled one. */
  showLabel?: boolean;
  /** CSS anchor name this decoration positions itself against, if any. */
  anchorName?: string;
  onClick: () => void;
};

function createDecorationButton(options: DecorationButtonOptions): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `qti-choice-decoration qti-choice-decoration--${options.modifier}`;
  button.contentEditable = 'false';
  button.title = options.label;
  button.setAttribute('aria-label', options.label);
  // `position-anchor` isn't in lib.dom's CSSStyleDeclaration yet.
  if (options.anchorName) button.style.setProperty('position-anchor', options.anchorName);
  button.appendChild(createIcon(options.icon, options.iconSize));

  if (options.showLabel) {
    const text = document.createElement('span');
    text.textContent = options.label;
    button.appendChild(text);
  }

  // Keep the ProseMirror selection where it is — the pill's visibility depends
  // on it, and the remove/add handlers resolve their own positions anyway.
  button.addEventListener('mousedown', event => event.preventDefault());
  button.addEventListener('click', event => {
    event.preventDefault();
    options.onClick();
  });

  return button;
}

/**
 * The × and the settings pill are rendered *after* the node they decorate (see
 * `buildDecorations`), so the node they act on is always the one immediately
 * before the widget position.
 */
function nodeBefore(
  state: EditorState,
  pos: number,
  nodeName: string,
): { node: ProseMirrorNode; from: number; to: number } | null {
  const $pos = state.doc.resolve(pos);
  const node = $pos.nodeBefore;
  if (!node || node.type.name !== nodeName) return null;
  return { node, from: pos - node.nodeSize, to: pos };
}

/** Drops `identifier` from a comma-joined `correctResponse`; null when empty. */
function withoutIdentifier(correctResponse: unknown, identifier: string): string | null {
  const identifiers = Array.isArray(correctResponse)
    ? correctResponse.map(String)
    : typeof correctResponse === 'string' && correctResponse
      ? correctResponse.split(',')
      : [];

  const remaining = identifiers.filter(entry => entry && entry !== identifier);
  return remaining.length > 0 ? remaining.join(',') : null;
}

function removeChoiceAt(view: EditorView, widgetPos: number | undefined): void {
  if (widgetPos == null) return;
  const { state } = view;
  const choice = nodeBefore(state, widgetPos, CHOICE_NODE_NAME);
  if (!choice) return;

  const $choice = state.doc.resolve(choice.from);
  const interactionPos = $choice.before($choice.depth);
  const interactionNode = state.doc.nodeAt(interactionPos);
  if (!interactionNode || interactionNode.type.name !== INTERACTION_NODE_NAME) return;

  // The schema requires `qtiSimpleChoice+`; never delete the last one.
  if (interactionNode.childCount <= 2) return;

  const tr = state.tr;
  const correctResponse = withoutIdentifier(interactionNode.attrs.correctResponse, choice.node.attrs.identifier);
  if (correctResponse !== interactionNode.attrs.correctResponse) {
    tr.setNodeMarkup(interactionPos, undefined, { ...interactionNode.attrs, correctResponse });
  }
  tr.delete(tr.mapping.map(choice.from), tr.mapping.map(choice.to));

  view.dispatch(tr);
  view.focus();
}

function appendChoiceAt(view: EditorView, widgetPos: number | undefined): void {
  if (widgetPos == null) return;
  const { state } = view;
  const choice = createSimpleChoiceNode(state.schema);
  if (!choice) return;

  // The widget sits at the end of the interaction's content, which is exactly
  // where the new choice belongs.
  const tr = state.tr.insert(widgetPos, choice);
  // Offset 2 = into the choice, into its paragraph — same as `insertSimpleChoiceOnEnter`.
  tr.setSelection(TextSelection.create(tr.doc, widgetPos + 2)).scrollIntoView();

  view.dispatch(tr);
  view.focus();
}

function openSettingsAt(view: EditorView, widgetPos: number | undefined): void {
  if (widgetPos == null) return;
  const interaction = nodeBefore(view.state, widgetPos, INTERACTION_NODE_NAME);
  if (!interaction) return;

  const detail: QtiOpenNodeSettingsDetail = {
    nodeTypeName: INTERACTION_NODE_NAME,
    tagName: INTERACTION_TAG_NAME,
    pos: interaction.from,
    attrs: { ...interaction.node.attrs },
  };

  view.dom.dispatchEvent(
    new CustomEvent<QtiOpenNodeSettingsDetail>(QTI_OPEN_NODE_SETTINGS_EVENT, {
      detail,
      bubbles: true,
      composed: true,
    }),
  );
}

/**
 * Decorations are derived fresh from state on every doc *and* selection change,
 * which is what makes the "pill only while the selection is inside" rule free.
 *
 * Placement rule: the × and the pill are emitted *after* the node they belong
 * to — the × between its choice and the next, the pill just after the whole
 * interaction. That keeps them out of the custom elements' slotted content and,
 * more importantly, makes the decorated node a *preceding sibling*: CSS anchor
 * positioning refuses to anchor an element to its own ancestor, so a widget
 * nested inside the choice could never anchor to it. Only the `+` stays inside,
 * because it is laid out in flow rather than anchored.
 */
function buildDecorations(state: EditorState): DecorationSet {
  const interactionType = state.schema.nodes[INTERACTION_NODE_NAME];
  if (!interactionType) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (node.type !== interactionType) return true;

    const interactionEnd = pos + node.nodeSize;
    const selectionInside = state.selection.from >= pos && state.selection.to <= interactionEnd;
    const choiceCount = node.childCount - 1; // minus the prompt

    // Anchor names have to be unique per decorated node: when several elements
    // share one name the browser binds every anchored box to the LAST of them,
    // which would stack all the ×'s on the final choice. Names are derived from
    // the node's position, so they stay stable for as long as the node does.
    const interactionAnchor = `--qti-choice-interaction-${pos}`;
    decorations.push(
      Decoration.node(pos, interactionEnd, { style: `anchor-name: ${interactionAnchor}` }),
    );

    if (selectionInside) {
      decorations.push(
        Decoration.widget(
          interactionEnd,
          (view, getPos) =>
            createDecorationButton({
              modifier: 'settings',
              icon: 'sliders',
              iconSize: 16,
              label: translateQti('interaction.settings', { target: view.dom }),
              showLabel: true,
              anchorName: interactionAnchor,
              onClick: () => openSettingsAt(view, getPos()),
            }),
          { side: 1, key: `qti-choice-settings-${pos}`, ignoreSelection: true, stopEvent: () => true },
        ),
      );
    }

    node.forEach((child, offset) => {
      if (child.type.name !== CHOICE_NODE_NAME) return;

      const choicePos = pos + 1 + offset;
      const afterChoice = choicePos + child.nodeSize;
      const choiceAnchor = `--qti-simple-choice-${choicePos}`;

      decorations.push(
        Decoration.node(choicePos, afterChoice, { style: `anchor-name: ${choiceAnchor}` }),
      );

      // The schema requires `qtiSimpleChoice+`: with one choice left there is
      // nothing to remove, so the affordance isn't offered.
      if (choiceCount <= 1) return;

      decorations.push(
        Decoration.widget(
          afterChoice,
          (view, getPos) =>
            createDecorationButton({
              modifier: 'remove',
              icon: 'x',
              iconSize: 14,
              label: translateQti('choice.removeOption', { target: view.dom }),
              anchorName: choiceAnchor,
              onClick: () => removeChoiceAt(view, getPos()),
            }),
          {
            // side 0 keeps the × ahead of the trailing `+` widget where the last
            // choice's boundary and the interaction's end coincide, so the CSS
            // adjacency (`choice:hover + .remove`) always holds.
            side: 0,
            key: `qti-choice-remove-${child.attrs.identifier}`,
            ignoreSelection: true,
            stopEvent: () => true,
          },
        ),
      );
    });

    decorations.push(
      Decoration.widget(
        interactionEnd - 1,
        (view, getPos) =>
          createDecorationButton({
            modifier: 'add',
            icon: 'plus',
            iconSize: 16,
            label: translateQti('choice.addOption', { target: view.dom }),
            onClick: () => appendChoiceAt(view, getPos()),
          }),
        { side: 1, key: `qti-choice-add-${pos}`, ignoreSelection: true, stopEvent: () => true },
      ),
    );

    // Choice interactions don't nest.
    return false;
  });

  return DecorationSet.create(state.doc, decorations);
}

export function createChoiceInteractionDecoratorPlugin(): Plugin {
  return new Plugin({
    key: choiceDecoratorPluginKey,
    props: {
      decorations: buildDecorations,
    },
  });
}
