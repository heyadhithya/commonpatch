export function describeIndex(board, loading) {
  if (!board.asOf) return loading
    ? { label: 'Checking GitHub…', detail: 'CommonPatch is retrieving the project index.' }
    : { label: 'Index unavailable', detail: 'The index could not be retrieved. Retry when you have a connection.' };
  if (board.cache === 'stale') return {
    label: 'Last successful check',
    detail: 'GitHub could not be reached on the latest attempt. The board is showing the most recent available check.'
  };
  if (board.source === 'snapshot') return {
    label: 'Dated snapshot',
    detail: 'You are viewing a saved edition of the board. Its timestamp shows when these opportunities were checked. Open an issue to check its current status.'
  };
  if (board.partial) return {
    label: 'Partial GitHub index',
    detail: 'GitHub returned a limited set of matches. Counts include only the issues retrieved in this check. More opportunities may exist in the original repositories.'
  };
  return {
    label: 'GitHub sync',
    detail: 'The latest available GitHub search returned these open, unlocked and unassigned issues with invitation labels from their maintainers.'
  };
}
