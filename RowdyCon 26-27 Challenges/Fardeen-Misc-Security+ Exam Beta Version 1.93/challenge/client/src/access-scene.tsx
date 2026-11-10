import React, {useId} from 'react';
import {Avatar} from './objects';
import './access-scene.css';

type Place = 'outside' | 'vestibule';
type AccessDraft = {
  outer: boolean;
  inner: boolean;
  hatch: boolean;
  candidate: Place;
  visitor: Place;
  footerOpen?: boolean;
};
type Props = {
  draft: AccessDraft;
  act: (op: string, args?: any) => Promise<any>;
  disabled: boolean;
};

function DoorLeaf({open}: {open: boolean}) {
  return <svg className="access-v3-door-art" viewBox="0 0 44 48" aria-hidden="true">
    <path className="access-v3-door-frame" d="M5 45V3H39V45M3 45H41" />
    <path className="access-v3-door-leaf" d={open ? 'M8 6L25 12V39L8 44Z' : 'M8 6H35V44H8Z'} />
    <circle cx={open ? 21 : 30} cy="27" r="2" fill="#3920d8" />
  </svg>;
}

export function AccessScene({draft, act, disabled}: Props) {
  const walkingStatusId = useId();
  const people = [
    {id: 'candidate' as const, label: 'C-701'},
    {id: 'visitor' as const, label: 'VISITOR'},
  ];
  const publicEmpty = people.every(person => draft[person.id] !== 'outside');
  const vestibuleEmpty = people.every(person => draft[person.id] !== 'vestibule');

  return <section className="access-v3" aria-label="Access vestibule">
    <p className="access-v3-controls">Click a door or hatch. Use each person's WALK arrow.</p>

    <div className="access-v3-plan">
      <div className="access-v3-public"><b>PUBLIC</b></div>
      <div className="access-v3-vestibule"><b>VESTIBULE</b></div>
      <div className="access-v3-secure"><b>SECURE</b><span>ACCESS<br/><strong>C-701</strong></span></div>
    </div>

    <svg className="access-v3-passage" viewBox="0 0 514 244" role="img" aria-label="Yellow maintenance passage from public to secure">
      <path className="access-v3-passage-edge" d="M8 158V215H504V158" />
      <path className="access-v3-passage-line" d="M8 158V215H504V158" />
      <path className="access-v3-passage-arrows" d="M4 163L8 157L12 163M500 163L504 157L508 163" />
    </svg>

    {publicEmpty && <span className="access-v3-empty access-v3-empty-public">EMPTY</span>}
    {vestibuleEmpty && <span className="access-v3-empty access-v3-empty-vestibule">EMPTY</span>}

    {people.map((person, index) => {
      const inside = draft[person.id] === 'vestibule';
      const destination = inside ? 'public' : 'vestibule';
      return <div key={person.id} className={`access-v3-person ${inside ? 'in-vestibule' : ''}`}
        style={{left: 13 + index * 64}} role="group"
        aria-label={`${person.label} in ${inside ? 'vestibule' : 'public'}`}>
        <span className="access-v3-avatar" aria-hidden="true"><Avatar visitor={person.id === 'visitor'}/></span>
        <b>{person.label}</b>
        <button type="button" className="access-v3-walk" disabled={disabled || !draft.outer}
          aria-label={`Walk ${person.label} to ${destination}`} aria-describedby={walkingStatusId}
          onClick={() => void act('move-person', {person: person.id, to: inside ? 'outside' : 'vestibule'})}>
          {inside ? <><span aria-hidden="true">←</span> WALK</> : <>WALK <span aria-hidden="true">→</span></>}
        </button>
      </div>;
    })}

    <button type="button" className={`access-v3-door access-v3-outer ${draft.outer ? 'is-open' : ''}`}
      disabled={disabled} aria-label={`${draft.outer ? 'Close' : 'Open'} outer door`}
      onClick={() => void act('outer', {open: !draft.outer})}>
      <span className="access-v3-door-name">OUTER</span>
      <DoorLeaf open={draft.outer}/>
      <strong>{draft.outer ? 'OPEN' : 'CLOSED'}</strong>
    </button>

    <button type="button" className="access-v3-door access-v3-inner"
      disabled={disabled} aria-label="Admit to secure"
      onClick={() => void act('open-inner', {})}>
      <span className="access-v3-door-name">INNER</span>
      <DoorLeaf open={draft.inner}/>
      <strong>ADMIT <span aria-hidden="true">→</span></strong>
      <span className="access-v3-admit-to">TO SECURE</span>
      <small>{draft.inner ? 'OPEN' : 'CLOSED'}</small>
    </button>

    <p id={walkingStatusId} className="access-v3-walking-state" role="status">
      {draft.outer ? 'OUTER OPEN · WALKING AVAILABLE' : 'OUTER CLOSED · WALKING BLOCKED'}
    </p>

    <button type="button" className={`access-v3-hatch ${draft.hatch ? 'is-open' : ''}`}
      disabled={disabled} aria-label={`${draft.hatch ? 'Close' : 'Open'} maintenance hatch`}
      onClick={() => void act('hatch', {open: !draft.hatch})}>
      <span>MAINTENANCE HATCH · <strong>{draft.hatch ? 'OPEN' : 'CLOSED'}</strong></span>
      <svg viewBox="0 0 208 27" aria-hidden="true">
        <path className="access-v3-hatch-frame" d="M91 3H96M112 3H117M91 24H96M112 24H117" />
        <path className="access-v3-hatch-leaf" d={draft.hatch ? 'M95 3L116 2L116 8L95 9Z' : 'M101 3H107V24H101Z'} />
        <circle cx={draft.hatch ? 112 : 104} cy={draft.hatch ? 5 : 19} r="1.2" fill="#3920d8" />
      </svg>
    </button>
  </section>;
}
