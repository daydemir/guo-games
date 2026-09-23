import { isAttendee } from '../../core/content';
import { bountyBoard, me, myBounty } from '../../core/selectors';
import type { Action } from '../../core/actions';
import type { State } from '../../core/state';
import { Card, Screen } from '../../ui/primitives';

const TONE = { open: 'plain', claimed: 'live', confirmed: 'settled', void: 'void' } as const;

/**
 * Opt-in bounties with a Quiet Confirm: one witness taps once, and that is the
 * whole proof system. No photos, no uploads, no referees.
 */
export function Bounties({
  state,
  locked,
  run,
}: {
  state: State;
  locked: boolean;
  run: (action: Action, note?: string) => boolean;
}) {
  const who = me(state);
  const playing = isAttendee(who) && !locked;
  const held = myBounty(state);

  return (
    <Screen
      title="Bounties"
      lede={
        held
          ? `You are carrying ${held.bounty.title}. One at a time is the rule.`
          : 'Take one, or take none. Both are fine.'
      }
    >
      {bountyBoard(state).map(({ bounty, owner, witness, status }) => (
        <Card
          key={bounty.id}
          band={bounty.moment}
          title={bounty.title}
          note={bounty.detail}
          tone={TONE[status]}
          footer={
            status === 'confirmed' ? (
              <p className="hint">
                {owner} did it. {witness} saw it.
              </p>
            ) : status === 'claimed' ? (
              <p className="hint">{owner} is carrying this one.</p>
            ) : status === 'void' ? (
              <p className="hint">Voided. Nobody lost anything.</p>
            ) : null
          }
        >
          <div className="admin">
            {playing && status === 'open' && !held ? (
              <button className="primary" type="button" onClick={() => run({ type: 'claim', id: bounty.id })}>
                Claim {bounty.title}
              </button>
            ) : null}

            {playing && status === 'claimed' && owner !== who ? (
              <button
                className="primary"
                type="button"
                onClick={() => run({ type: 'confirm', id: bounty.id }, `Confirmed for ${owner}.`)}
              >
                I saw it, confirm for {owner}
              </button>
            ) : null}

            {playing && status === 'claimed' && owner === who ? (
              <p className="hint">Hand your phone to anyone else here. One tap from them closes it.</p>
            ) : null}

            {playing && status !== 'void' && status !== 'open' ? (
              <button
                type="button"
                className="quiet"
                onClick={() => run({ type: 'voidBounty', id: bounty.id }, 'Voided. No penalty, no explanation owed.')}
              >
                Void this
              </button>
            ) : null}
          </div>
        </Card>
      ))}
    </Screen>
  );
}
