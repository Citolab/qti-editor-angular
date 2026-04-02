export interface QtiDocumentJson {
  type: string;
  content?: QtiNodeJson[];
}

export interface QtiNodeJson {
  type: string;
  attrs?: Record<string, unknown>;
  content?: QtiNodeJson[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}
