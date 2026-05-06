import { jsonFromHTML } from 'prosekit/core';

import type { Schema } from 'prosekit/pm/model';

export interface ImportXmlResult {
  json: ReturnType<typeof jsonFromHTML>;
  metadata?: {
    title?: string;
    identifier?: string;
  };
}

export interface ImportXmlOptions {
  schema: Schema;
}

function cleanXmlText(xmlText: string): string {
  return xmlText
    .replace(/^\uFEFF/, '')
    .replace(/^\u200B/, '')
    .replace(/^\u00A0/, '')
    .trim();
}

function extractMetadata(xmlText: string): { title?: string; identifier?: string } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');
  const assessmentItem = doc.querySelector('assessmentItem, qti-assessment-item');

  if (!assessmentItem) return {};

  return {
    title: assessmentItem.getAttribute('title') || undefined,
    identifier: assessmentItem.getAttribute('identifier') || undefined,
  };
}

function cleanEmptyNamespaces(html: string): string {
  return html
    .replace(/\s+xmlns=""/g, '')
    .replace(/\s+xmlns:xsi="[^"]*"/g, '')
    .replace(/\s+xsi:schemaLocation="[^"]*"/g, '');
}

function xmlToHtml(xml: string): string {
  let xmlToParse = xml.trim();
  const assessmentItemMatches = xml.match(/<qti-assessment-item[\s>]/g);
  const hasMultipleItems = assessmentItemMatches != null && assessmentItemMatches.length > 1;

  if (hasMultipleItems) {
    xmlToParse = `<items>${xml}</items>`;
  }

  const doc = new DOMParser().parseFromString(xmlToParse, 'application/xml');
  const parseError = doc.querySelector('parsererror');

  if (parseError) {
    throw new Error(`Failed to parse XML: ${parseError.textContent ?? 'Unknown error'}`);
  }

  const serializer = new XMLSerializer();

  if (hasMultipleItems) {
    const assessmentItems = doc.querySelectorAll('qti-assessment-item');
    const htmlParts: string[] = [];

    assessmentItems.forEach((item, index) => {
      const itemBody = item.querySelector('qti-item-body');
      if (!itemBody) return;

      if (index > 0) {
        htmlParts.push('<qti-item-divider></qti-item-divider>');
      }

      const content = Array.from(itemBody.childNodes)
        .map((node) => serializer.serializeToString(node))
        .join('');

      htmlParts.push(cleanEmptyNamespaces(content));
    });

    return htmlParts.join('');
  }

  const itemBody = doc.querySelector('qti-item-body') ?? doc.documentElement;
  return cleanEmptyNamespaces(
    Array.from(itemBody.childNodes)
      .map((node) => serializer.serializeToString(node))
      .join(''),
  );
}

export function importXmlFromText(xmlText: string, options: ImportXmlOptions): ImportXmlResult {
  let cleanedXml = cleanXmlText(xmlText);
  const firstLtIndex = cleanedXml.indexOf('<');

  if (firstLtIndex > 0) {
    cleanedXml = cleanedXml.slice(firstLtIndex);
  }

  const html = xmlToHtml(cleanedXml);
  const json = jsonFromHTML(html, { schema: options.schema });
  const metadata = extractMetadata(cleanedXml);

  return { json, metadata };
}

export async function importXmlFromFile(
  file: File,
  options: ImportXmlOptions,
): Promise<ImportXmlResult> {
  return importXmlFromText(await file.text(), options);
}

export function openXmlFilePicker(options: ImportXmlOptions): Promise<ImportXmlResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xml,application/xml,text/xml';

    input.onchange = async (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        reject(new Error('No file selected'));
        return;
      }

      try {
        resolve(await importXmlFromFile(file, options));
      } catch (error) {
        console.error('[QTI Editor] Failed to import XML:', error);
        reject(error);
      }
    };

    input.click();
  });
}

