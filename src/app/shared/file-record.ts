import type { QtiContentChangeEventDetail } from '../../lib/qti-prosekit-integration/events';

export interface SavedFileRecord {
  id: string;
  name: string;
  identifier: string;
  title: string;
  json: QtiContentChangeEventDetail['json'];
  updatedAt: number;
}
