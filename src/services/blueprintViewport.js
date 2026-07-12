export function normalizeZoomScale(nextScale) {
  const numericScale = Number(nextScale);
  if (!Number.isFinite(numericScale)) {
    return 1;
  }
  return Math.min(3, Math.max(1, numericScale));
}

export function applyPanDelta(currentPanOffset, deltaX, deltaY) {
  const safePan = currentPanOffset || { x: 0, y: 0 };
  return {
    x: (Number.isFinite(safePan.x) ? safePan.x : 0) + deltaX,
    y: (Number.isFinite(safePan.y) ? safePan.y : 0) + deltaY,
  };
}
