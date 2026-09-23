import { z } from 'zod';
export const ATTENDEES = ['Kevin', 'Deniz', 'Nick', 'Jack', 'Simon', 'Nate', 'Dmitriy'] as const;
export const COLORS = ['sea', 'coral', 'sand', 'lilac'] as const;
export const PARTY_CODE = 'GUO27';
export const EXPIRES_AT = '2027-07-01T10:00:00Z'; // Demo default, set to the actual trip end in Hawaii.
export const FUTURE_OPENS_AT = '2030-07-01T10:00:00Z';
export const MAX_PICKS = 3;
export const FISH = ['Mahi-mahi','Ono','Ahi','Marlin','Uku','Opakapaka','Ulua'] as const;
export const BOUNTIES = [
  {id:'callback',title:'The callback', detail:'Ask a friend for a favorite Kevin memory. Listen all the way through.',moment:'Anytime'},
  {id:'spark',title:'Energy-Dip Spark',detail:'During the 4–7pm regroup, offer the crew a quiet break or a favorite song. Let them choose.',moment:'4–7pm'},
  {id:'toast',title:'A little gratitude',detail:'Thank someone for a small thing they did today. Tell them why it mattered.',moment:'Dinner'},
] as const;
export type BountyId = typeof BOUNTIES[number]['id'];
export type Attendee = typeof ATTENDEES[number];
const MISSIONS: Record<Attendee,string> = {
  Kevin:'Quietly thank someone for a friendship moment you still remember.',
  Deniz:'Ask a friend which small moment from today they want to remember.',
  Nick:'Invite someone to share a favorite song, with no pressure to perform.',
  Jack:'Tell a friend one thing you admire about how they show up for others.',
  Simon:'Find a shared memory with someone you have not caught up with yet.',
  Nate:'Offer to help with one small task, then let someone else take the credit.',
  Dmitriy:'Save one kind observation about the crew to share at dinner.',
};
const identitySchema = z.enum([...ATTENDEES, 'Spectator']);
const sessionSchema = z.object({attendee: identitySchema, name:z.string().trim().min(1).max(24), color:z.enum(COLORS)});
export const PREDICTIONS = [
  {id:'flight', moment:'Flights', title:'Will the whole crew land before sunset?', detail:'One arrival window. Seven very different packing strategies.'},
  {id:'fishing', moment:'Fishing', title:'Will we spot three different fish species?', detail:'Noticing counts. No catch required, and no pressure to go out.'},
  {id:'downtime', moment:'Downtime', title:'Will an old photo start a new story?', detail:'A callback from the archives, before we sit down to dinner.'},
  {id:'dinner', moment:'Dinner', title:'Will the first toast make Kevin laugh?', detail:'A kind toast. A familiar story. An easy yes or no.'},
] as const;
export type PredictionId = typeof PREDICTIONS[number]['id'];
const pickSchema = z.enum(['yes','no']);
export const MOMENTS = ['Before Maui','Flights','Fishing','Downtime','Dinner'] as const;
const mediaSchema = z.object({name:z.string(),type:z.string(),bytes:z.number(),data:z.string()});
export type Media = z.infer<typeof mediaSchema>;
const memorySchema = z.object({id:z.string(),author:z.enum(ATTENDEES),about:z.enum(ATTENDEES),moment:z.enum(MOMENTS),text:z.string(),media:mediaSchema.nullable(),revealed:z.boolean()});
const stateSchema = z.object({version:z.literal(2), session:sessionSchema.nullable(),
  settings:z.object({hideRankings:z.boolean(),awards:z.enum(['stories','points'])}).default({hideRankings:true,awards:'stories'}),
  dinner:z.boolean().default(false),
  future:z.record(z.string(),z.string().max(300)).default({}),
  vault:z.array(memorySchema).default([]),
  missions:z.record(z.string(),z.enum(['accepted','done','void'])).default({}),
  bounties:z.record(z.string(),z.object({owner:z.enum(ATTENDEES).optional(),status:z.enum(['claimed','confirmed','void']),witness:z.enum(ATTENDEES).optional()})).default({}),
  draft:z.record(z.string(),z.enum(FISH)).default({}),
  results:z.record(z.string(), z.enum(['yes','no','void'])).default({}),
  picks:z.record(z.string(),z.record(z.string(),pickSchema)).default({}),
});
export type State = z.infer<typeof stateSchema>;
export function seed(): State { return stateSchema.parse({version:2, session:null}); }
export function join(state:State, code:string, attendee:Attendee|'Spectator', name:string, color:typeof COLORS[number]): State {
  if (code.trim().toUpperCase() !== PARTY_CODE) throw new Error('Check the party code. Try GUO27.');
  const result = sessionSchema.safeParse({attendee,name,color});
  if (!result.success) throw new Error('Choose an attendee and a name of 1 to 24 characters.');
  return {...state, session:result.data};
}

export type Action = {type:'revealMemory'|'removeMemory';id:string} | {type:'revealMemory'|'removeMemory';id:string} | {type:'sealFuture';text:string} | {type:'dinner'} | {type:'settings';hideRankings:boolean;awards:'stories'|'points'} | {type:'submitMemory';about:Attendee;moment:typeof MOMENTS[number];text:string;media:Media|null} | {type:'mission';status:'accepted'|'done'|'void'} | {type:'claim'|'confirm'|'voidBounty';id:BountyId} | {type:'draft';fish:typeof FISH[number]} | {type:'pick'; id:PredictionId; choice:'yes'|'no'} | {type:'settle';id:PredictionId;result:'yes'|'no'} | {type:'voidPrediction';id:PredictionId};
export function isOrganizer(state:State) { return state.session?.attendee === 'Deniz' || state.session?.attendee === 'Nick'; }
export function scores(state:State) { return ATTENDEES.map(attendee => ({attendee, points:Object.entries(state.picks[attendee] ?? {}).filter(([id,pick]) => state.results[id] === pick).length * 10 + Object.values(state.bounties).filter(b => b.owner === attendee && b.status === 'confirmed').length * 5})); }
export function act(state:State, action:Action, now = Date.now()):State {
  if (isRecap(now)) throw new Error('The trip has closed. This is a read-only recap.');
  if (!state.session) throw new Error('Join the party first.');
  const person = state.session.attendee;
  if (person === 'Spectator') throw new Error('Spectators can enjoy the recap. Choose an attendee to participate.');
  const next = structuredClone(state);
  if (action.type === 'revealMemory' || action.type === 'removeMemory') {
    const memory = next.vault.find(m => m.id === action.id);
    if (!memory) throw new Error('This memory no longer exists.');
    if (action.type === 'revealMemory') {
      if (!isOrganizer(state)) throw new Error('Only an organizer can reveal memories.');
      if (!state.dinner) throw new Error('Open dinner before revealing stories.');
      memory.revealed = true;
    } else {
      if (memory.author !== person && !isOrganizer(state)) throw new Error('You may only withdraw your own memory.');
      next.vault = next.vault.filter(m => m.id !== action.id);
    }
  }
  if (action.type === 'settings' || action.type === 'dinner') {
    if (!isOrganizer(state)) throw new Error('Only an organizer can reveal dinner or change settings.');
    if (action.type === 'settings') next.settings = {hideRankings:action.hideRankings,awards:action.awards};
    else next.dinner = true;
  }
  if (action.type === 'sealFuture') {
    if (!action.text.trim() || action.text.trim().length > 300) throw new Error('Write a future prediction of 1 to 300 characters.');
    if (state.future[person]) throw new Error('Your future prediction is already sealed.');
    next.future[person] = action.text.trim();
  }
  if (action.type === 'submitMemory') {
    if (!action.text.trim() && !action.media) throw new Error('Add a story or a small file.');
    if (action.text.trim().length > 1200) throw new Error('Keep stories under 1,200 characters.');
    if (state.vault.length >= 20) throw new Error('This device holds up to 20 memories.');
    if (action.media) validateMedia(action.media);
    if (state.vault.reduce((n,m) => n + (m.media?.data.length ?? 0),0) + (action.media?.data.length ?? 0) > 1400000) throw new Error('The local media budget is full. Add a text story instead.');
    next.vault.push({id:crypto.randomUUID(),author:person,about:action.about,moment:action.moment,text:action.text.trim(),media:action.media,revealed:false});
  }
  if (action.type === 'mission') {
    const current = state.missions[person];
    if (action.status === 'done' && current !== 'accepted') throw new Error('First accept your mission.');
    if (action.status === 'accepted' && current) throw new Error('This mission is already closed or accepted.');
    next.missions[person] = action.status;
  }
  if (action.type === 'claim') {
    if (state.bounties[action.id]) throw new Error('This bounty is already claimed or void.');
    if (Object.values(state.bounties).some(b => b.owner === person && b.status !== 'void')) throw new Error('Just one bounty. Let the day happen.');
    next.bounties[action.id] = {owner:person,status:'claimed'};
  }
  if (action.type === 'confirm') {
    const bounty = state.bounties[action.id];
    if (!bounty || bounty.status !== 'claimed') throw new Error('This needs an open claim first.');
    if (bounty.owner === person) throw new Error('A different attendee must witness this moment.');
    next.bounties[action.id] = {...bounty,status:'confirmed',witness:person};
  }
  if (action.type === 'voidBounty') next.bounties[action.id] = {...state.bounties[action.id],status:'void'};
  if (action.type === 'draft') {
    if (Object.entries(state.draft).some(([owner,fish]) => owner !== person && fish === action.fish)) throw new Error('Already drafted. Choose another species.');
    next.draft[person] = action.fish;
  }
  if (action.type === 'settle') {
    if (!isOrganizer(state)) throw new Error('Only an organizer can settle.');
    if (state.results[action.id]) throw new Error('This prediction is closed.');
    next.results[action.id] = action.result;
  }
  if (action.type === 'voidPrediction') next.results[action.id] = 'void';
  if (action.type === 'pick') {
    if (state.results[action.id]) throw new Error('This prediction is closed.');
    const picks = next.picks[person] ?? {};
    if (!picks[action.id] && Object.keys(picks).length >= MAX_PICKS) throw new Error('Keep it to three predictions.');
    next.picks[person] = {...picks, [action.id]:action.choice};
  }
  return next;
}

export function privateMission(state:State) {
  const person = state.session?.attendee;
  return !person || person === 'Spectator' ? null : {text:MISSIONS[person], status:state.missions[person] ?? 'sealed'};
}

export function vaultEntries(state:State) { return state.vault.filter(m => m.author === state.session?.attendee || isOrganizer(state) || m.revealed); }

export const MEDIA_TYPES = ['image/jpeg','image/png','image/webp','audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/ogg','audio/webm'];
export const MAX_FILE_BYTES = 300000;
export function validateMedia(media:Media) {
  if (!MEDIA_TYPES.includes(media.type)) throw new Error('Use JPEG, PNG, WebP, MP3, M4A, WAV, OGG or WebM audio.');
  if (media.bytes > MAX_FILE_BYTES) throw new Error('Keep each file under 300 KB.');
  const prefix = `data:${media.type};base64,`;
  const encoded = media.data.slice(prefix.length);
  if (!media.data.startsWith(prefix) || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0 || media.bytes < 1 || Math.floor(encoded.length * 3/4) - (encoded.match(/=+$/)?.[0].length ?? 0) !== media.bytes) throw new Error('The file content could not be read. Try another file.');
}

export function visibleScores(state:State) { return state.settings.hideRankings && !state.dinner ? null : scores(state).sort((a,b) => b.points-a.points); }
export function futureEntries(state:State, now = Date.now()) { return now < Date.parse(FUTURE_OPENS_AT) ? [] : Object.entries(state.future).map(([attendee,text]) => ({attendee,text})); }

export function isRecap(now = Date.now()) { return now >= Date.parse(EXPIRES_AT); }


export const STORAGE_KEY = 'guo-games';
type StorageReader = Pick<Storage,'getItem'>;
type StorageWriter = Pick<Storage,'setItem'>;
export function load(storage:StorageReader):State {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const value: unknown = JSON.parse(raw);
    const migrated = typeof value === 'object' && value !== null && 'version' in value && value.version === 1 ? {...value,version:2} : value;
    return stateSchema.parse(migrated);
  } catch { throw new Error('Your saved data could not be loaded. Export it before resetting this device.'); }
}
export function save(storage:StorageWriter,state:State) {
  try { storage.setItem(STORAGE_KEY,JSON.stringify(state)); }
  catch { throw new Error('Device storage is unavailable or full. Nothing was saved. Try a smaller file or free browser storage.'); }
}
