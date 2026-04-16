import { listInteractionDescriptors } from '@qti-editor/core/interactions/composer';
import { defineBasicExtension } from 'prosekit/basic';
import { defineKeymap, defineNodeSpec, definePlugin, union, type Extension } from 'prosekit/core';

import type { Command } from 'prosekit/pm/state';

export function defineQtiInteractionsExtension(options?: { include?: string[] }): Extension {
  const allDescriptors = listInteractionDescriptors();
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

  if (enterCommands.length > 0) {
    keymap['Enter'] = (state, dispatch, view) =>
      enterCommands.some((command) => command(state, dispatch, view));
  }

  for (const descriptor of descriptors) {
    if (descriptor.insertCommand && descriptor.keyboardShortcut) {
      keymap[descriptor.keyboardShortcut] = descriptor.insertCommand;
    }
  }

  const pluginExtensions = descriptors
    .flatMap((d) => d.pluginFactories ?? [])
    .map((pluginFactory) => definePlugin(pluginFactory));

  return union(...nodeSpecExtensions, defineKeymap(keymap), ...pluginExtensions);
}

export function defineQtiExtension() {
  return union(defineBasicExtension(), defineQtiInteractionsExtension());
}
