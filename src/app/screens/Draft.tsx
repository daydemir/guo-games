import { isAttendee } from '../../core/content';
import { draftBoard, me, myFish } from '../../core/selectors';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
import { Screen } from '../../ui/primitives';

/**
 * The Dock Draft. One species each, no duplicates, decided before lines hit the
 * water. Switching your pick releases the old species back to the board.
 */
export function Draft({
  state,
  locked,
  run,
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => void;
}) {
  const board = draftBoard(state);
  const mine = myFish(state);
  const who = me(state);
  const canDraft = isAttendee(who) && !locked;

  return (
    <Screen
      title="Dock Draft"
      lede={
        mine
          ? `You are on ${mine.name}. Change it any time before the boat leaves.`
          : 'Pick one species. Nobody else can have it.'
      }
    >
      <ul className="board" aria-label="Dock draft board">
        {board.map(({ fish, drafter }) => {
          const isMine = drafter === who;
          const gone = drafter !== null && !isMine;
          return (
            <li key={fish.id}>
              <button
                type="button"
                className={`draft-pick${isMine ? ' chosen' : ''}${gone ? ' gone' : ''}`}
                disabled={!canDraft || gone}
                aria-pressed={isMine}
                onClick={() => run({ type: 'draft', fish: fish.id }, `${fish.name} is yours.`)}
              >
                <span className="draft-name">{fish.name}</span>
                <span className="draft-note">{fish.note}</span>
                <span className="draft-owner">{drafter ?? 'Open'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="fineprint">
        Nobody has to go out on the boat, and nothing here needs a fish to actually be caught. Noticing counts.
      </p>
    </Screen>
  );
}
