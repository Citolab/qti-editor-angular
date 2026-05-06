import { listInteractionDescriptors } from '@qti-editor/core/interactions/composer';
import { qtiMatchEnterCommand } from '@qti-editor/interaction-match';
import { defineBasicExtension } from 'prosekit/basic';
import { defineKeymap, defineNodeSpec, definePlugin, union, type Extension } from 'prosekit/core';
import { splitBlock } from 'prosekit/pm/commands';
import { gapMatchInteractionDescriptor } from '@qti-editor/interaction-gap-match';
import { qtiItemDividerDescriptor } from '@qti-editor/qti-item-divider';

import type { Command } from 'prosekit/pm/state';
import type { InteractionDescriptor } from '@qti-editor/interfaces';

export function defineQtiInteractionsExtension(options?: { include?: string[] }): Extension {
  const allDescriptors = Array.from(
    new Map(
      [...listInteractionDescriptors(), gapMatchInteractionDescriptor, qtiItemDividerDescriptor].map((descriptor) => [
        descriptor.tagName,
        descriptor,
      ]),
    ).values(),
  ) as InteractionDescriptor[];
  const descriptors = options?.include
    ? allDescriptors.filter((d) => options.include!.includes(d.tagName))
    : allDescriptors;

  const seenSpecs = new Set<string>();
  const nodeSpecExtensions: Extension[] = [];

  for (const descriptor of descriptors) {
    for (const { name, spec } of descriptor.nodeSpecs) {
      if (seenSpecs.has(name)) continue;
      seenSpecs.add(name);
      nodeSpecExtensions.push(defineNodeSpec({ name, ...spec }));
    }
  }

  const keymap: Record<string, Command> = {};
  const enterCommands = descriptors
    .map((descriptor) => descriptor.enterCommand)
    .filter((command): command is Command => command != null);

  if (descriptors.some((descriptor) => descriptor.tagName === 'qti-match-interaction')) {
    enterCommands.push(qtiMatchEnterCommand);
  }

  if (enterCommands.length > 0) {
    keymap['Enter'] = (state, dispatch, view) => {
      for (const command of enterCommands) {
        if (command(state, dispatch, view)) return true;
      }

      return splitBlock(state, dispatch, view);
    };
  }

  for (const descriptor of descriptors) {
    if (descriptor.insertCommand && descriptor.keyboardShortcut) {
      keymap[descriptor.keyboardShortcut] = descriptor.insertCommand;
    }
  }

  const pluginExtensions = descriptors
    .flatMap((descriptor) => descriptor.pluginFactories ?? [])
    .map((pluginFactory) => definePlugin(pluginFactory));

  return union(...nodeSpecExtensions, defineKeymap(keymap), ...pluginExtensions);
}

export function defineQtiExtension() {
  return union(defineBasicExtension(), defineQtiInteractionsExtension());
}
