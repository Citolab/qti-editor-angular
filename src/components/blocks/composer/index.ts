import { html, LitElement, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { defineDocChangeHandler, defineMountHandler, union, type Editor } from 'prosekit/core';
import { ListDOMSerializer } from 'prosekit/extensions/list';
import { buildAssessmentItemXml, formatXml } from '@qti-editor/core';

const DEBOUNCE_MS = 300;
const VOID_HTML_TAGS = ['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'col', 'embed', 'param', 'track', 'wbr'];

function toXmlCompatibleFragment(sourceHtml: string): string {
  const voidTagPattern = new RegExp(`<(${VOID_HTML_TAGS.join('|')})(\\s[^<>]*?)?>`, 'gi');
  return sourceHtml.replace(/&nbsp;/g, '&#160;').replace(voidTagPattern, (match) => {
    if (match.endsWith('/>')) return match;
    return `${match.slice(0, -1)} />`;
  });
}

@customElement('qti-composer')
export class QtiComposer extends LitElement {
  @property({ attribute: false })
  identifier = '';

  @property({ attribute: false })
  override title = '';

  @property({ attribute: false })
  override lang = 'en';

  #liveComposeEnabled = false;

  get liveComposeEnabled(): boolean {
    return this.#liveComposeEnabled;
  }

  set liveComposeEnabled(value: boolean) {
    const old = this.#liveComposeEnabled;
    if (old === value) return;
    this.#liveComposeEnabled = value;
    this.requestUpdate('liveComposeEnabled', old);
  }

  #xmlUrl = '';
  #formattedXml = '';
  #copyStatus: 'idle' | 'success' | 'error' = 'idle';
  #copyStatusTimer: number | null = null;
  #debounceTimer: number | null = null;
  #editor: Editor | null = null;
  #unregisterExtension: VoidFunction | null = null;

  get editor(): Editor | null {
    return this.#editor;
  }

  set editor(value: Editor | null) {
    if (this.#editor === value) return;
    this.#teardownExtension();
    this.#editor = value;
    this.#setupExtension();
  }

  override createRenderRoot() {
    return this;
  }

  override updated(changedProperties: Map<string, unknown>) {
    super.updated(changedProperties);
    if (changedProperties.has('identifier') || changedProperties.has('title') || changedProperties.has('lang')) {
      if (this.liveComposeEnabled) {
        this.#composeXml();
        this.requestUpdate();
      }
    }
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.#teardownExtension();
    this.#cancelDebounce();
    this.#revokeXmlUrl();
    if (this.#copyStatusTimer != null) {
      window.clearTimeout(this.#copyStatusTimer);
      this.#copyStatusTimer = null;
    }
  }

  #setupExtension() {
    if (!this.#editor) return;

    const onDocChange = () => {
      if (this.liveComposeEnabled) {
        this.#debouncedComposeXml();
      }
    };

    if (this.#editor.mounted) {
      this.#unregisterExtension = this.#editor.use(defineDocChangeHandler(onDocChange));
    } else {
      this.#unregisterExtension = this.#editor.use(
        union(
          defineMountHandler(() => {
            if (this.liveComposeEnabled) {
              this.#composeXml();
              this.requestUpdate();
            }
          }),
          defineDocChangeHandler(onDocChange),
        ),
      );
    }
  }

  #teardownExtension() {
    this.#unregisterExtension?.();
    this.#unregisterExtension = null;
  }

  #cancelDebounce() {
    if (this.#debounceTimer != null) {
      window.clearTimeout(this.#debounceTimer);
      this.#debounceTimer = null;
    }
  }

  #debouncedComposeXml() {
    this.#cancelDebounce();
    this.#debounceTimer = window.setTimeout(() => {
      this.#debounceTimer = null;
      this.#composeXml();
      this.requestUpdate();
    }, DEBOUNCE_MS);
  }

  #composeXml() {
    if (!this.#editor?.mounted) {
      this.#clearXmlState();
      return;
    }

    const state = this.#editor.state;
    const serializer = ListDOMSerializer.fromSchema(state.schema);
    const fragment = serializer.serializeFragment(state.doc.content);
    const div = document.createElement('div');
    div.appendChild(fragment);
    const html = div.innerHTML;

    const xmlCompatibleHtml = toXmlCompatibleFragment(html);
    const itemBody = new DOMParser().parseFromString(
      `<qti-item-body>${xmlCompatibleHtml}</qti-item-body>`,
      'application/xml',
    );

    const xml = buildAssessmentItemXml({
      identifier: this.identifier.trim() || 'ITEM_1',
      title: this.title.trim() || 'Untitled Item',
      lang: this.lang.trim() || 'en',
      itemBody,
    });

    this.#setXmlUrl(xml);
    this.#formattedXml = formatXml(xml);
  }

  #setXmlUrl(xml: string) {
    this.#revokeXmlUrl();
    if (!xml.trim()) {
      this.#xmlUrl = '';
      return;
    }
    const xmlWithDeclaration = xml.startsWith('<?xml')
      ? xml
      : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`;
    const xmlFile = new File([xmlWithDeclaration], 'assessment-item.xml', { type: 'application/xml' });
    this.#xmlUrl = URL.createObjectURL(xmlFile);
  }

  #revokeXmlUrl() {
    if (!this.#xmlUrl) return;
    URL.revokeObjectURL(this.#xmlUrl);
    this.#xmlUrl = '';
  }

  #clearXmlState() {
    this.#revokeXmlUrl();
    this.#formattedXml = '';
  }

  async #copyXmlToClipboard() {
    if (!this.#formattedXml.trim()) return;
    try {
      await navigator.clipboard.writeText(this.#formattedXml);
      this.#setCopyStatus('success');
    } catch {
      this.#setCopyStatus('error');
    }
  }

  #buildQtiPreviewUrl(xml: string): string {
    const bytes = new TextEncoder().encode(xml);
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return `https://qti.citolab.nl/preview?sharedQti=${encodeURIComponent(window.btoa(binary))}`;
  }

  #openInQtiPreview() {
    if (!this.#xmlUrl) return;
    const xmlWithDeclaration = this.#formattedXml.startsWith('<?xml')
      ? this.#formattedXml
      : `<?xml version="1.0" encoding="UTF-8"?>\n${this.#formattedXml}`;
    window.open(this.#buildQtiPreviewUrl(xmlWithDeclaration), '_blank', 'noopener,noreferrer');
  }

  #setCopyStatus(status: 'idle' | 'success' | 'error') {
    this.#copyStatus = status;
    if (this.#copyStatusTimer != null) window.clearTimeout(this.#copyStatusTimer);
    if (status !== 'idle') {
      this.#copyStatusTimer = window.setTimeout(() => {
        this.#copyStatus = 'idle';
        this.#copyStatusTimer = null;
        this.requestUpdate();
      }, 1500);
    }
  }

  #onLiveComposeToggle = (event: Event) => {
    this.liveComposeEnabled = (event.target as HTMLInputElement).checked;
    if (this.liveComposeEnabled) {
      this.#composeXml();
      this.requestUpdate();
    } else {
      this.#clearXmlState();
      this.requestUpdate();
    }
  };

  override render() {
    return html`
      <section class="card border border-base-300/50 bg-base-100 p-4 space-y-3">
        <div class="flex items-center justify-between gap-3">
          <h3 class="text-sm font-semibold">XML composer</h3>
          <label class="flex items-center gap-2 text-xs">
            <span class="font-medium">Live compose</span>
            <input
              class="toggle toggle-sm toggle-primary"
              type="checkbox"
              .checked=${this.liveComposeEnabled}
              @change=${this.#onLiveComposeToggle}
            />
          </label>
        </div>
        ${!this.liveComposeEnabled
          ? html`<p class="text-xs text-base-content/70">Enable live compose to generate XML.</p>`
          : this.#xmlUrl
            ? html`
                <div class="flex items-center gap-3">
                  <a
                    class="inline-block text-xs link link-primary"
                    href=${this.#xmlUrl}
                    download="assessment-item.xml"
                  >
                    Download XML
                  </a>
                  <button class="btn btn-xs" type="button" @click=${this.#openInQtiPreview}>
                    Open preview
                  </button>
                  <button class="btn btn-xs" type="button" @click=${this.#copyXmlToClipboard}>
                    Copy
                  </button>
                  ${this.#copyStatus === 'success'
                    ? html`<span class="text-xs text-success">Copied!</span>`
                    : this.#copyStatus === 'error'
                      ? html`<span class="text-xs text-error">Copy failed</span>`
                      : nothing}
                </div>
                <pre class="m-0 max-h-80 overflow-auto rounded-lg border border-base-300/40 bg-base-200 p-3 text-xs text-base-content">${this.#formattedXml}</pre>
              `
            : html`<p class="text-xs text-base-content/70">No content yet.</p>`}
      </section>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'qti-composer': QtiComposer;
  }
}
