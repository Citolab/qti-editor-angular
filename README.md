
# QTI Editor Angular Extension

This project is an example Angular integration of the [qti-editor](https://github.com/Citolab/qti-editor) ecosystem. It demonstrates how to integrate QTI Editor’s modular, ProseMirror-based authoring environment into an Angular application, using the recommended public packages and UI registry approach.

**Live Demo:** [https://citolab.github.io/qti-editor-angular/](https://citolab.github.io/qti-editor-angular/)

---

## About

This application is designed to showcase and extend the capabilities of the main [qti-editor](https://github.com/Citolab/qti-editor) repository. It provides a reference implementation for embedding QTI-compliant authoring tools in Angular apps, following the best practices outlined in the [qti-editor documentation](https://qti-editor.citolab.nl/docs).

The editor is built on [ProseMirror](https://prosemirror.net/) and leverages QTI-specific schema nodes, commands, and web components. This ensures that authored content is always valid QTI and that only supported interactions and structures are allowed.

## Integration Approach

- Install the required `@qti-editor` interaction and core packages from npm.
- Use [ProseKit](https://prosekit.dev) for ready-made UI components, or copy example Lit UI components from the registry.
- Maintain a small local ProseKit helper layer for editor assembly and event wiring.
- The intended public model is: `prosekit` + `@qti-editor/interaction-*` + `@qti-editor/core` + copied registry UI.

For more details, see the [Angular integration guide](https://qti-editor.citolab.nl/docs/frameworks/angular/).

## Attribute Panel Overrides

This app includes an app-level override layer for the attributes panel. It lets you
change which fields are shown, how they are labeled, and where they appear in the
panel without changing `@qti-editor/core`.

The override configuration lives in:

- `src/app/overrides/attribute-panel-overrides.ts`

The override type is exposed from:

- `src/app/shared/attribute-panel-overrides.ts`

Overrides are applied by the custom `qti-attributes-panel` implementation in:

- `src/components/blocks/attributes-panel/index.ts`

Supported override options per node type:

- `editableAttributes`: replace the editable attribute list
- `hiddenAttributes`: hide specific attributes from the panel
- `removeFields`: remove specific fields entirely
- `fieldOrder`: control the order of editable and read-only fields
- `fields`: override field labels or input definitions
- `friendlyEditors`: append custom friendly editors
- `replaceFriendlyEditors`: replace the core friendly editor list instead of appending
- `friendlyEditorsPlacement`: place friendly editors at the top or bottom of the editable section

Example:

```ts
import type { AttributePanelOverrides } from '../shared/attribute-panel-overrides';

export const ATTRIBUTE_PANEL_OVERRIDES: AttributePanelOverrides = {
  qtitextentryinteraction: {
    fieldOrder: ['responseIdentifier', 'expectedLength', 'placeholderText', 'class'],
    hiddenAttributes: ['format'],
    fields: {
      responseIdentifier: { label: 'Response identifier' },
      expectedLength: { label: 'Expected length', input: 'number' },
    },
    friendlyEditorsPlacement: 'bottom',
  },
};
```

Use this when the host app wants a different authoring experience than the shared
QTI core metadata exposes by default. The core schema and attribute semantics stay
the same; only the panel presentation changes.

## Development

To start a local development server:

```bash
ng serve
```

Visit `http://localhost:4200/` in your browser. The app will reload automatically on code changes.

## Building

To build the project for production:

```bash
ng build --configuration production --base-href /qti-editor-angular/
```

The build output will be in the `dist/` directory. This project is automatically deployed to GitHub Pages on every push to `main`.

## Testing

To run unit tests:

```bash
ng test
```

## Resources

- [QTI Editor Documentation](https://citolab.github.io/qti-editor/)
- [QTI Editor Angular Integration Guide](https://citolab.github.io/qti-editor/docs/frameworks/angular/)
- [Main qti-editor repository](https://github.com/Citolab/qti-editor)
- [ProseKit](https://prosekit.dev)

---

For questions or contributions, please see the main [qti-editor](https://github.com/Citolab/qti-editor) repository.
