// Swipe left or up on the pick card for the next pick. Pure so it can be tested off-device.

export type PanEnd = {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
};

const DISTANCE = 60;
const VELOCITY = 500;

export function isNextSwipe(e: PanEnd): boolean {
  const left = -e.translationX;
  const up = -e.translationY;
  const horizontal = Math.abs(e.translationX) >= Math.abs(e.translationY);
  if (horizontal) return left >= DISTANCE || (left > 0 && -e.velocityX >= VELOCITY);
  return up >= DISTANCE || (up > 0 && -e.velocityY >= VELOCITY);
}
