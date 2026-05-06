import {
  ChangeDetectionStrategy,
  Component,
  Input,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { SavedFileRecord } from '../../shared/file-record';

@Component({
  selector: 'app-menu-bar',
  templateUrl: './menu-bar.html',
  styleUrl: './menu-bar.css',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuBarComponent {
  // Signal inputs (read-only data flowing in)
  readonly appTitle = input('QTI Editor');
  readonly savedFiles = input<SavedFileRecord[]>([]);
  readonly currentFileId = input<string | null>(null);

  // fileName uses a classic @Input setter so [(ngModel)] on the inner <input>
  // continues to work without cursor-position bugs. The local plain property is
  // what ngModel binds to; changes are pushed back out via fileNameChange.
  @Input() set fileName(value: string) { this.localFileName = value; }

  // Outputs
  readonly fileNameChange = output<string>();
  readonly newFile = output<void>();
  readonly saveFile = output<void>();
  readonly importXml = output<void>();
  readonly exportXml = output<void>();
  readonly loadFile = output<string>();
  readonly deleteFile = output<string>();

  protected localFileName = 'angular-qti-item';
  protected readonly loadMenuOpen = signal(false);

  get fileNameInputWidth(): number {
    return Math.max(80, this.localFileName.length * 9);
  }

  protected onLoadFile(fileId: string): void {
    this.loadFile.emit(fileId);
    this.loadMenuOpen.set(false);
  }

  protected onDeleteFile(event: Event, fileId: string): void {
    event.stopPropagation();
    this.deleteFile.emit(fileId);
  }

  protected formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  protected trackFile(_: number, file: SavedFileRecord): string {
    return file.id;
  }
}
