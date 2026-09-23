import { MAX_PICKS, MOMENTS, isAttendee } from '../../core/content';
import { draftBoard, isOrganizer, me, myFish, picksLeft, predictionBoard } from '../../core/selectors';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
import { Card, Screen, Tally } from '../../ui/primitives';

type Run = (action: Action, note?: string) => boolean;

const RESULT_TONE = { yes: 'settled', no: 'settled', void: 'void' } as const;

/**
 * Everything you call ahead of time: a few yes or no predictions, and one fish.
 * Points only. There is no buy-in, no payout and no way to put money on
 * anything, which is deliberate for a group that likes to.
 */
export function Picks({ state, locked, run }: { state: State; locked: boolean; run: Run }) {
  const left = picksLeft(state);
  const playing = isAttendee(me(state)) && !locked;

  return (
    <Screen
      title="Picks"
      lede={
        playing
          ? `Hold up to ${MAX_PICKS} predictions at a time, ${left} open now. Then draft one fish. Points only, never money.`
          : 'Everyone’s calls and the fish draft. Points only, never money.'
      }
    >
      <p className="jump">
        <a href="#dock-draft">Skip to the Dock Draft</a>
      </p>
      <Predictions state={state} locked={locked} run={run} />
      <DockDraft state={state} locked={locked} run={run} />
    </Screen>
  );
}

function Predictions({ state, locked, run }: { state: State; locked: boolean; run: Run }) {
  const board = predictionBoard(state);
  const organizer = isOrganizer(state);
  const left = picksLeft(state);
  // Spectators cannot act, and after settlement only an organizer can void.
  // Offering the control to anyone else just produces a refusal.
  const playing = isAttendee(me(state)) && !locked;

  return MOMENTS.filter((moment) => board.some((row) => row.prediction.moment === moment)).map((moment) => {
    const anchor = `moment-${moment.replace(/\s+/g, '-')}`;
    return (
      <section key={moment} className="group" aria-labelledby={anchor}>
        <h3 className="group-head" id={anchor}>
          {moment}
        </h3>
        {board
          .filter((row) => row.prediction.moment === moment)
          .map(({ prediction, myPick, result, tally }) => (
            <Card
              key={prediction.id}
              band={result ? `Settled ${result}` : 'Open'}
              title={prediction.title}
              note={prediction.detail}
              tone={result ? RESULT_TONE[result] : 'plain'}
              footer={<Tally yes={tally.yes} no={tally.no} />}
            >
              {playing && !result ? (
                <div className="choices" role="group" aria-label={`Your call on: ${prediction.title}`}>
                  {(['yes', 'no'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={myPick === choice ? 'choice chosen' : 'choice'}
                      aria-pressed={myPick === choice}
                      disabled={left === 0 && myPick === null}
                      onClick={() => run({ type: 'pick', id: prediction.id, choice })}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              ) : null}

              {myPick ? <p className="hint">You called {myPick}.</p> : null}

              <div className="admin">
                {organizer && !result && !locked ? (
                  <>
                    <button type="button" onClick={() => run({ type: 'settle', id: prediction.id, result: 'yes' })}>
                      Settle yes
                    </button>
                    <button type="button" onClick={() => run({ type: 'settle', id: prediction.id, result: 'no' })}>
                      Settle no
                    </button>
                  </>
                ) : null}
                {playing && result !== 'void' && (!result || organizer) ? (
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => run({ type: 'voidPrediction', id: prediction.id }, 'Voided. Nobody lost anything.')}
                  >
                    Void
                  </button>
                ) : null}
              </div>
            </Card>
          ))}
      </section>
    );
  });
}

/**
 * The Dock Draft. One species each, no duplicates, decided before lines hit the
 * water. Switching your pick releases the old species back to the board.
 */
function DockDraft({ state, locked, run }: { state: State; locked: boolean; run: Run }) {
  const board = draftBoard(state);
  const mine = myFish(state);
  const who = me(state);
  const canDraft = isAttendee(who) && !locked;

  return (
    <section className="group" aria-labelledby="dock-draft">
      <h3 className="group-head" id="dock-draft" tabIndex={-1}>
        Dock Draft
      </h3>
      <p className="hint group-lede">
        {mine
          ? `You are on ${mine.name}. Change it any time before the boat leaves.`
          : 'One species each. Nobody else can have yours.'}
      </p>
      <ul className="board" aria-label="Dock draft board">
        {board.map(({ fish, drafter }) => {
          const isMine = drafter !== null && drafter === who;
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
                <span className="draft-owner">{isMine ? 'You' : (drafter ?? 'Open')}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="fineprint">
        Nobody has to go out on the boat, and nothing here needs a fish to actually be caught. Noticing counts.
      </p>
    </section>
  );
}
