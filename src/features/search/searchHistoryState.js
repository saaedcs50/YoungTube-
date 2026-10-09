/**
 * Resolve Search's initial/restored UI state from one History entry.
 * A query on any other entry kind is not a Search Results query and must not
 * leak into the Search landing screen.
 *
 * @param {{ entryKind?: string, searchStage?: string, query?: unknown } | null | undefined} meta
 */
export function getSearchRestorationState(meta) {
  const isSearchResultsEntry = meta?.entryKind === 'search-results' && meta?.searchStage === 'results';
  const searchInput = isSearchResultsEntry && typeof meta.query === 'string' ? meta.query : '';

  return {
    searchStage: isSearchResultsEntry ? 'results' : 'landing',
    searchInput,
    debouncedSearch: searchInput.trim().toLowerCase(),
  };
}
