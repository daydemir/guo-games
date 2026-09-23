import { MAX_PICKS, MOMENTS } from '../../core/content';
import { isOrganizer, me, picksLeft, predictionBoard } from '../../core/selectors';
import { isAttendee } from '../../core/content';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
import { Card, Screen, Tally } from '../../ui/primitives';

const RESULT_TONE = { yes: 'settled', no: 'settled', void: 'void' } as const;

/**
 * Capped yes or no markets. Points only: there is no buy-in, no payout and no
 * way to put money on anything, which is deliberate for a group that likes to.
 */
export function Predictions({
  state,
  locked,
  run,
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => void;
}) {
  const board = predictionBoard(state);
  const organizer = isOrganizer(state);
  const left = picksLeft(state);
  // Spectators cannot act, and after settlement only an organizer can void.
  // Offering the control to anyone else just produces a refusal.
  const playing = isAttendee(me(state)) && !locked;

  return (
    <Screen
      title="Predictions"
      lede={`Hold up to ${MAX_PICKS} at a time. ${left} slot${left === 1 ? '' : 's'} open. Points only, never money.`}
    >
      {MOMENTS.filter((moment) => board.some((row) => row.prediction.moment === moment)).map((moment) => {
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
                  {result || locked ? null : (
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
                  )}

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
      })}
    </Screen>
  );
}
