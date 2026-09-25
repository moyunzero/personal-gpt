import type { Citation } from "@personal-gpt/shared/types/kb";

export interface CitationSnippetGroup {
  snippet: string;
  chunkIndex?: number;
  /** 1-based index in the filtered citation array, matching [S n] in the answer. */
  sourceNumber: number;
}

export interface CitationDocumentGroup {
  documentId: string;
  title: string;
  similarity: number;
  snippets: CitationSnippetGroup[];
}

/** One card per documentId. First-seen order is the card order; snippets stay in array order. */
export function groupCitationsByDocument(citations: Citation[]): CitationDocumentGroup[] {
  const groups: CitationDocumentGroup[] = [];
  const byDocument = new Map<string, CitationDocumentGroup>();

  citations.forEach((citation, index) => {
    let group = byDocument.get(citation.documentId);
    if (!group) {
      group = {
        documentId: citation.documentId,
        title: citation.title,
        similarity: citation.similarity,
        snippets: [],
      };
      byDocument.set(citation.documentId, group);
      groups.push(group);
    }
    if (citation.similarity > group.similarity) {
      group.similarity = citation.similarity;
    }
    group.snippets.push({
      snippet: citation.snippet,
      chunkIndex: citation.chunkIndex,
      sourceNumber: index + 1,
    });
  });

  return groups;
}
