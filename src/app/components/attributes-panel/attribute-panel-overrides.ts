import type { AttributePanelOverrides } from '../components/attributes-panel/attributes-panel.component';

/**
 * App-level attribute panel overrides.
 *
 * This lets the host application control which fields are visible and how they
 * are ordered without changing @qti-editor/core metadata.
 */
export const ATTRIBUTE_PANEL_OVERRIDES: AttributePanelOverrides = {
  // Example:
  // qtitextentryinteraction: {
  //   fieldOrder: ['responseIdentifier', 'expectedLength', 'placeholderText', 'class'],
  //   hiddenAttributes: ['format'],
  //   fields: {
  //     responseIdentifier: { label: 'Response identifier' },
  //     expectedLength: { label: 'Expected length', input: 'number' },
  //   },
  // },
};
