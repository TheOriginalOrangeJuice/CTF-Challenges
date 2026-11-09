import React from 'react';
import {Bitmap, composite, Drag, Drop, type Bits} from './objects';
import './token-viewer.css';

export type ViewerToken = {id: string; share: Bits};
export type TokenTransform = {x: number; y: number; rotation: number};
export type TokenLayers = Record<string, TokenTransform>;
export type TokenBacks = Record<string, boolean>;

export interface TokenViewerProps {
  tokens: ViewerToken[];
  layers: TokenLayers;
  selectedId?: string | null;
  backs: TokenBacks;
  onLayers: (next: TokenLayers) => void;
  onSelected: (id: string | null) => void;
  onBacks: (next: TokenBacks) => void;
  onMagnify: (bitmap: Bits | undefined) => void;
  disabled?: boolean;
}

/** The same pixel operation powers both the small display and its magnifier. */
export function combineTokenLayers(tokens: ViewerToken[], layers: TokenLayers): Bits | undefined {
  const first = tokens.find(token => token.share?.width && token.share?.height)?.share;
  if (!first) return undefined;
  return composite(tokens.flatMap(token => layers[token.id] && token.share
    ? [{bitmap: token.share, ...layers[token.id]}]
    : []), first.width, first.height);
}

/** Render inside Objects. Puzzle state belongs to the parent, including token faces. */
export function TokenViewer({
  tokens, layers, selectedId, backs, onLayers, onSelected, onBacks, onMagnify,
  disabled = false,
}: TokenViewerProps) {
  const pinned = tokens.filter(token => layers[token.id]);
  const selected = pinned.find(token => token.id === selectedId) ?? pinned[0];
  const selectedNumber = selected ? tokens.findIndex(token => token.id === selected.id) + 1 : null;
  const transform = selected ? layers[selected.id] : undefined;
  const bitmap = combineTokenLayers(tokens, layers);

  const add = (id: string) => {
    if (disabled || !backs[id] || !tokens.some(token => token.id === id)) return;
    // Placing a new image snaps to the existing registration origin. Selecting an
    // already pinned image must not discard the player's translation or rotation.
    if (!layers[id]) onLayers({...layers, [id]: {x: 0, y: 0, rotation: 0}});
    onSelected(id);
  };

  const remove = (id: string) => {
    if (disabled) return;
    const next = {...layers};
    delete next[id];
    onLayers(next);
    if (selected?.id === id) onSelected(pinned.find(token => token.id !== id)?.id ?? null);
  };

  const change = (update: Partial<TokenTransform>) => {
    if (!disabled && selected && transform) {
      onLayers({...layers, [selected.id]: {...transform, ...update}});
    }
  };

  return <div className="token-viewer" aria-label="Token image viewer">
    <div className="tv-rack" aria-label="Exam token faces">
      {tokens.length === 0 && <p className="tv-no-tokens">No token images.</p>}
      {tokens.map((token, index) => {
        const back = Boolean(backs[token.id]);
        const isPinned = Boolean(layers[token.id]);
        return <div className="tv-token" key={token.id} data-token-id={token.id}>
          <div className="tv-token-caption"><b>TOKEN {index + 1}</b><span>{back ? 'REVERSE' : 'FRONT'}</span></div>
          {back
            ? <Drag id={`share-${token.id}`} label={`Pick up token ${index + 1} reverse image`} className="tv-token-image">
                <Bitmap bitmap={token.share} label={`Token ${index + 1} reverse pixels`}/>
              </Drag>
            : <div className="tv-token-image tv-token-front" aria-label={`Token ${index + 1} front`}><span aria-hidden="true">➜</span></div>}
          <button className="tv-flip" type="button" disabled={disabled}
            aria-label={`Show token ${index + 1} ${back ? 'front' : 'reverse'}`}
            onClick={() => onBacks({...backs, [token.id]: !back})}>
            {back ? 'SHOW FRONT' : 'SHOW REVERSE'} <span aria-hidden="true">↶</span>
          </button>
          <button className={`tv-pin ${isPinned ? 'tv-is-pinned' : ''}`} type="button"
            disabled={disabled || (!isPinned && !back)}
            aria-label={`${isPinned ? 'Remove' : 'Add'} token ${index + 1} layer`}
            title={!back && !isPinned ? 'Show the reverse to add its image.' : undefined}
            onClick={() => isPinned ? remove(token.id) : add(token.id)}>
            <span aria-hidden="true">{isPinned ? '−' : '+'}</span> {isPinned ? 'REMOVE LAYER' : 'ADD LAYER'}
          </button>
        </div>;
      })}
    </div>

    <Drop id="final-viewer" label="XOR viewer image input" className="tv-combiner"
      onPut={piece => {if (piece.startsWith('share-')) add(piece.slice(6));}}>
      <div className="tv-bezel">
        <b>XOR VIEWER <span aria-hidden="true">⊕</span></b>
        <span className="tv-input-count" data-input-count={pinned.length}>{pinned.length} {pinned.length === 1 ? 'INPUT' : 'INPUTS'}</span>
        <button type="button" disabled={disabled || !bitmap} onClick={() => onMagnify(bitmap)} aria-label="Magnify combined token pixels">MAGNIFY <span aria-hidden="true">⌕</span></button>
      </div>
      <div className="tv-screen">
        {bitmap && <Bitmap bitmap={bitmap} label={`Combined token pixels from ${pinned.length} input layers`}/>}
        {pinned.length === 0 && <span className="tv-empty">NO INPUT LAYERS</span>}
      </div>
      <div className="tv-layer-picks" aria-label="Select a pinned image layer">
        {tokens.map((token, index) => <button type="button" key={token.id}
          className={selected?.id === token.id ? 'tv-selected-layer' : ''}
          disabled={disabled || !layers[token.id]} aria-pressed={selected?.id === token.id}
          aria-label={`Select token ${index + 1} layer`}
          data-layer-id={token.id} onClick={() => onSelected(token.id)}>
          <span aria-hidden="true">{layers[token.id] ? '▣' : '□'}</span> {index + 1} · {selected?.id === token.id ? 'SELECTED' : layers[token.id] ? 'PINNED' : 'EMPTY'}
        </button>)}
      </div>
      <p className="tv-xor-key">Black toggles a pixel; matching black pixels cancel.</p>
    </Drop>

    <div className="tv-adjust" aria-label="Selected layer image controls">
      <div className="tv-readout">
        <b>{selected ? `TOKEN ${selectedNumber} SELECTED` : 'NO LAYER SELECTED'}</b>
        <output aria-label="Selected image position and angle" aria-live="off">
          X: {transform?.x ?? '—'} · Y: {transform?.y ?? '—'} · ANGLE: {transform ? `${transform.rotation}°` : '—'}
        </output>
      </div>
      <div className="tv-moves">
        <button type="button" disabled={disabled || !transform} aria-label="Move selected image left by 1 pixel" onClick={() => change({x: transform!.x - 1})}><span>MOVE LEFT</span><small>← 1 px</small></button>
        <button type="button" disabled={disabled || !transform} aria-label="Move selected image right by 1 pixel" onClick={() => change({x: transform!.x + 1})}><span>MOVE RIGHT</span><small>1 px →</small></button>
        <button type="button" disabled={disabled || !transform} aria-label="Move selected image up by 1 pixel" onClick={() => change({y: transform!.y - 1})}><span>MOVE UP</span><small>↑ 1 px</small></button>
        <button type="button" disabled={disabled || !transform} aria-label="Move selected image down by 1 pixel" onClick={() => change({y: transform!.y + 1})}><span>MOVE DOWN</span><small>↓ 1 px</small></button>
        <button type="button" disabled={disabled || !transform} aria-label="Rotate selected image by 180 degrees" onClick={() => change({rotation: (transform!.rotation + 180) % 360})}><span>ROTATE</span><small>↻ 180°</small></button>
      </div>
    </div>
  </div>;
}
