import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import {
  choiceInteractionClassGroups,
  parseChoiceInteractionClasses,
  serializeChoiceInteractionClasses,
  type ChoiceInteractionClassGroupId,
  type ChoiceInteractionClassState,
} from '@qti-editor/interaction-choice';
import type { AttributesNodeDetail } from '@qti-editor/prosemirror-attributes';

type ChoiceInteractionOptionPresentation = {
  label?: string;
  tooltip?: string;
  icon?: string;
};

type ChoiceInteractionGroupPresentation = {
  title?: string;
  tooltip?: string;
};

export interface ChoiceInteractionPanelPresentation {
  groups?: Partial<Record<ChoiceInteractionClassGroupId, ChoiceInteractionGroupPresentation>>;
  options?: Partial<Record<string, ChoiceInteractionOptionPresentation>>;
}

export interface AttributePatchEvent {
  pos: number;
  attrs: Record<string, unknown>;
}

const CHOICE_INTERACTION_NODE_TYPE = 'qtichoiceinteraction';

@Component({
  selector: 'app-choice-attributes-editor',
  standalone: true,
  templateUrl: './choice-attributes-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChoiceAttributesEditorComponent {
  readonly activeNode = input<AttributesNodeDetail | null>(null);
  readonly presentation = input<ChoiceInteractionPanelPresentation | null>(null);
  readonly patch = output<AttributePatchEvent>();

  protected readonly choiceNode = computed(() => {
    const node = this.activeNode();
    return node?.type.toLowerCase() === CHOICE_INTERACTION_NODE_TYPE ? node : null;
  });

  protected readonly classState = computed(() => {
    const node = this.choiceNode();
    if (!node) return null;
    return parseChoiceInteractionClasses(String(node.attrs['class'] ?? ''));
  });

  protected readonly classGroups = choiceInteractionClassGroups;

  private emitPatch(attrs: Record<string, unknown>): void {
    const node = this.choiceNode();
    if (!node) return;
    this.patch.emit({ pos: node.pos, attrs });
  }

  protected getSelectedGroupValue(
    classState: ChoiceInteractionClassState,
    groupId: ChoiceInteractionClassGroupId,
  ): string | null {
    if (groupId === 'inputControlHidden') {
      return classState.inputControlHidden ? 'qti-input-control-hidden' : null;
    }
    return (classState as Record<string, any>)[groupId] ?? null;
  }

  protected updateClass(
    classState: ChoiceInteractionClassState,
    groupId: ChoiceInteractionClassGroupId,
    className: string,
  ): void {
    const nextState = { ...classState, [groupId]: className } as ChoiceInteractionClassState;
    this.emitPatch({ class: serializeChoiceInteractionClasses(nextState) });
  }

  protected onBooleanChange(
    classState: ChoiceInteractionClassState,
    groupId: ChoiceInteractionClassGroupId,
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    const nextState = { ...classState, [groupId]: checked } as ChoiceInteractionClassState;
    this.emitPatch({ class: serializeChoiceInteractionClasses(nextState) });
  }

  protected getGroupPresentation(groupId: ChoiceInteractionClassGroupId): ChoiceInteractionGroupPresentation | null {
    return this.presentation()?.groups?.[groupId] ?? null;
  }

  protected getOptionPresentation(optionValue: string): ChoiceInteractionOptionPresentation | null {
    return this.presentation()?.options?.[optionValue] ?? null;
  }
}
