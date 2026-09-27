export function selectRange(visible, anchorIndex, targetIndex, selected) {
  const start = visible.findIndex(track => track.index === anchorIndex);
  const end = visible.findIndex(track => track.index === targetIndex);
  if (start < 0 || end < 0) return false;
  for (const track of visible.slice(Math.min(start, end), Math.max(start, end) + 1)) track.selected = selected;
  return true;
}
