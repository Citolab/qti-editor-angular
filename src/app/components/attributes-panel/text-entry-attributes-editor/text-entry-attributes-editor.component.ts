import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  getPrimaryTextEntryCorrectResponse,
  parseTextEntryCaseSensitiveAttribute,
  parseTextEntryClassState,
  parseTextEntryCorrectResponses,
  parseTextEntryLegacyCorrectResponse,
  serializeTextEntryClassState,
  textEntryWidthClassOptions,
  type TextEntryWidthClassOption,
} from '@qti-editor/interaction-text-entry';
import type { AttributesNodeDetail } from '@qti-editor/prosemirror-attributes';
import type { AttributePatchEvent } from '../choice-attributes-editor/choice-attributes-editor.component';

const TEXT_ENTRY_NODE_TYPE = 'qtitextentryinteraction';

const widthOptionLabels: Record<TextEntryWidthClassOption, string> = {
  'qti-input-width-2': '2 chars',
  'qti-input-width-4': '4 chars',
  'qti-input-width-6': '6 chars',
  'qti-input-width-10': '10 chars',
  'qti-input-width-15': '15 chars',
  'qti-input-width-20': '20 chars',
};

@Component({
  selector: 'app-text-entry-attributes-editor',
  standalone: true,
  templateUrl: './text-entry-attributes-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextEntryAttributesEditorComponent {
  readonly activeNode = input<AttributesNodeDetail | null>(null);
  readonly patch = output<AttributePatchEvent>();

  protected readonly widthOptions = textEntryWidthClassOptions;
  protected readonly widthOptionLabels = widthOptionLabels;

  protected readonly textEntryNode = computed(() => {
    const node = this.activeNode();
    return node?.type.toLowerCase() === TEXT_ENTRY_NODE_TYPE ? node : null;
  });

  protected readonly classState = computed(() => {
    const node = this.textEntryNode();
    if (!node) return null;
    return parseTextEntryClassState(String(node.attrs['class'] ?? ''));
  });

  protected readonly caseSensitive = computed(() => {
    const node = this.textEntryNode();
    if (!node) return false;
    return parseTextEntryCaseSensitiveAttribute(node.attrs['caseSensitive']);
  });

  protected readonly correctResponses = computed(() => {
    const node = this.textEntryNode();
    if (!node) return [];
    const responses = node.attrs['correctResponses'];
    if (Array.isArray(responses)) {
      return responses.map((r: unknown) => String(r ?? ''));
    }
    const parsed = parseTextEntryCorrectResponses(responses);
    if (parsed.length > 0) return parsed;
    const legacy = parseTextEntryLegacyCorrectResponse(node.attrs['correctResponse']);
    return legacy ? [legacy] : [];
  });

  private emitPatch(attrs: Record<string, unknown>): void {
    const node = this.textEntryNode();
    if (!node) return;
    this.patch.emit({ pos: node.pos, attrs });
  }

  protected onWidthChange(event: Event): void {
    const node = this.textEntryNode();
    if (!node) return;
    const value = (event.target as HTMLSelectElement).value as TextEntryWidthClassOption | '';
    const state = parseTextEntryClassState(String(node.attrs['class'] ?? ''));
    const nextClass = serializeTextEntryClassState({ ...state, widthClass: value || null });
    this.emitPatch({ class: nextClass });
  }

  protected onCaseSensitiveChange(event: Event): void {
    this.emitPatch({ caseSensitive: (event.target as HTMLInputElement).checked });
  }

  protected updateResponse(index: number, event: Event): void {
    const responses = [...this.correctResponses()];
    responses[index] = (event.target as HTMLInputElement).value;
    this.updateResponses(responses);
  }

  protected removeResponse(index: number): void {
    const responses = this.correctResponses().filter((_, i) => i !== index);
    this.updateResponses(responses);
  }

  protected addResponse(): void {
    this.updateResponses([...this.correctResponses(), '']);
  }

  private updateResponses(responses: string[]): void {
    this.emitPatch({
      correctResponses: responses,
      correctResponse: getPrimaryTextEntryCorrectResponse(responses),
    });
  }
}
