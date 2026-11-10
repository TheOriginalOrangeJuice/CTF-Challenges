# Final token viewer component

Revision 4 is an interface clarification of the existing Q20 image tool. The fixed token shares, their real XOR composition, the required reverse faces, 1-pixel movement, 180-degree rotation, and separate PIN submission remain intact. The central discovery is still the relationship between the retained token-back images. No completion check, prepared result, answer text, or eligibility hint is added to the component.

`challenge/client/src/token-viewer.tsx` exports `TokenViewer`, `combineTokenLayers`, and its TypeScript prop/data types. Its CSS is imported by the component. Render it inside the existing `Objects` provider. It occupies **x=0–350, y=0–244** of the logical 514×244 question body; the certificate form can occupy **x=365–514**. It inherits the established Quiz font and palette. The compact rack shows a front/reverse label and separate face and layer buttons; the viewer names its inputs, selected layer, coordinates, angle and control increments.

```ts
type ViewerToken = {id: string; share: Bits};
type TokenTransform = {x: number; y: number; rotation: number};
type TokenLayers = Record<string, TokenTransform>;
type TokenBacks = Record<string, boolean>;

interface TokenViewerProps {
  tokens: ViewerToken[]; // Supply current unspent tokens in stable order.
  layers: TokenLayers;
  selectedId?: string | null;
  backs: TokenBacks;
  onLayers(next: TokenLayers): void;
  onSelected(id: string | null): void;
  onBacks(next: TokenBacks): void;
  onMagnify(bitmap: Bits | undefined): void;
  disabled?: boolean;
}
```

Wire callbacks through **functional** `setLocal(previous => ({...previous, ...change}))` updates. Add/remove may update layers and selection in the same event. Keep all four draft values in the parent's existing session-storage record; the viewer itself owns no puzzle state. A legacy draft can map `local['back' + token.id]` into `backs` while migrating to a single map. `selectedId` may be null; display then selects the first pinned available layer. Removing the selected layer selects the next available one.

Showing a reverse enables **ADD LAYER**. The same reverse can be dragged, or picked up with the existing keyboard object interaction, into `data-drop="final-viewer"`. New placement uses `(0,0,0°)` as before. Re-selecting/re-dropping an already pinned image preserves its transformation. **REMOVE LAYER** followed by **ADD LAYER** restores origin placement. Showing its front again does not remove the already pinned copy. No layer can be added while its face is front. The input count includes only pinned, available token images. Empty and missing-token states do not disclose final eligibility rules.

All direction controls identify a one-pixel step; rotation identifies a 180-degree step. Every change calls the existing `composite` function on the actual provided bitmaps. The on-screen XOR key explains the ordinary tool operation: black toggles a pixel and matching black pixels cancel. Zero inputs render a blank composition, not fabricated noise or a solution. Magnify receives exactly the same computed bitmap. The parent supplies a focus-managed magnification dialog and restores focus to the trigger after closing it. `combineTokenLayers(tokens,layers)` is also exported if the parent needs a live rather than snapshot magnifier.

The component uses native buttons for flipping, adding, removing, selecting and moving; drag is optional. It has visible focus, disabled controls for unavailable operations, explicit selected/pinned/empty labels, no motion beyond a short hover transition, and a reduced-motion override. It does not add a new experimental deterrent: concealing these controls would harm human investigation, and the existing challenge's separate deterrent decision remains applicable.

## Validation boundary

The implementation was source-reviewed for controlled state, real-data transformations and fit within its declared logical bounds. Root owns fresh Condev staging, compilation, browser interaction/captures, magnifier integration, final document synchronization and shipped-tree parity. This contract does not claim those checks, independent human playtesting, listening or anti-agent effectiveness passed.
