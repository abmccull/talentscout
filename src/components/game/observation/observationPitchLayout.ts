import type { ObservationPitchMarker } from "./observationPitchModel";

// Presentation footprints: 64px body, 4px selected-ring allowance, 8px gap.
// A caption sits below the body, so rows need more room than columns.
const COLUMN_STRIDE = 80;
const ROW_STRIDE = 104;
const CENTER_INSET = 40;
const MINIMUM_FIELD_HEIGHT = 240;

export function createObservationPitchLayout(
  markers: readonly Pick<ObservationPitchMarker, "playerId" | "x" | "y">[],
  measuredWidth: number,
  measuredHeight: number,
): { minimumHeight: number; positions: Array<{ playerId: string; x: number; y: number }> } {
  const width = Math.max(COLUMN_STRIDE, Number.isFinite(measuredWidth) ? measuredWidth : 320);
  const columns = Math.max(1, Math.floor(width / COLUMN_STRIDE));
  const requiredRows = Math.max(1, Math.ceil(markers.length / columns));
  const minimumHeight = Math.max(MINIMUM_FIELD_HEIGHT, requiredRows * ROW_STRIDE);
  const height = Math.max(minimumHeight, Number.isFinite(measuredHeight) ? measuredHeight : minimumHeight);
  const rows = Math.max(requiredRows, Math.floor(height / ROW_STRIDE));
  const columnStep = width / columns;
  const rowStep = rows > 1 ? (height - ROW_STRIDE) / (rows - 1) : 0;
  const slots = Array.from({ length: columns * rows }, (_, index) => ({
    x: columnStep * ((index % columns) + 0.5),
    y: CENTER_INSET + Math.floor(index / columns) * rowStep,
  }));

  // The canonical normalized role anchors are untouched. Place each visible
  // portrait in the closest free schematic cell, in stable session order.
  // Selection/focus do not affect this assignment.
  const positions = markers.map(marker => {
    const desiredX = CENTER_INSET + (marker.x / 100) * (width - 2 * CENTER_INSET);
    const desiredY = CENTER_INSET + (marker.y / 100) * (height - ROW_STRIDE);
    let closestIndex = 0;
    let closestDistance = Infinity;
    for (let index = 0; index < slots.length; index++) {
      const candidate = slots[index];
      const distance = (candidate.x - desiredX) ** 2 + (candidate.y - desiredY) ** 2;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    }
    const [slot] = slots.splice(closestIndex, 1);
    return { playerId: marker.playerId, x: slot.x, y: slot.y };
  });
  return { minimumHeight, positions };
}
