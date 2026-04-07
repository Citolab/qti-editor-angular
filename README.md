
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
