/** Read-only production report. Run with an explicitly selected env file.
 * bun --env-file=/path/to/.env.local scripts/online-command-report.ts --hours 6
 * No app/db import: reporting must not initialize indexes or write game state.
 */
import { MongoClient } from 'mongodb';
import { COMMAND_BUCKET_MS } from '../lib/command-metrics';

const args = process.argv.slice(2);
const hours = Number(args[args.indexOf('--hours') + 1] ?? 6);
if (!Number.isFinite(hours) || hours <= 0 || hours > 168) throw new Error('--hours must be between 0 and 168');
if (!process.env.MONGODB_URI) throw new Error('Select an environment with MONGODB_URI');
const to = new Date(), from = new Date(Math.floor((to.getTime() - hours * 3_600_000) / COMMAND_BUCKET_MS) * COMMAND_BUCKET_MS);
const sums = Object.fromEntries(['requests', 'ok', 'rejected', 'errors', 'replayed', 'handlerMs', 'settleMs', 'commandMs', 'attempts'].map(key => [key, { $sum: `$${key}` }]));
const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'dong_song_thoi_dai');
  const [report] = await db.collection('online_command_stats').aggregate([
    { $match: { bucket: { $gte: from, $lte: to } } },
    { $facet: {
      coverage: [{ $group: { _id: null, ...sums, firstRecordedAt: { $min: '$firstSeen' }, lastRecordedAt: { $max: '$lastSeen' } } }, { $project: { _id: 0 } }],
      players: [{ $group: { _id: '$cityId', ...sums } }, { $sort: { requests: -1, _id: 1 } }, { $limit: 20 }],
      commands: [{ $group: { _id: '$command', ...sums } }, { $sort: { requests: -1, _id: 1 } }],
      batchActions: [
        { $match: { command: 'city.batch' } },
        { $project: { cityId: 1, actions: { $objectToArray: { $ifNull: ['$actions', {}] } } } },
        { $unwind: '$actions' },
        { $group: { _id: { cityId: '$cityId', action: '$actions.k' }, count: { $sum: '$actions.v' } } },
      ],
    } },
  ], { maxTimeMS: 10_000 }).toArray();
  const cityIds = report.players.map((row: { _id: string }) => row._id);
  const cities = await db.collection<{ _id: string; name: string; owner?: string }>('cities').find({ _id: { $in: cityIds } }, { projection: { name: 1, owner: 1 }, maxTimeMS: 5000 }).toArray();
  const ownerIds = cities.flatMap(city => city.owner ? [city.owner] : []);
  const users = await db.collection<{ _id: string; name: string }>('users').find({ _id: { $in: ownerIds } }, { projection: { name: 1 }, maxTimeMS: 5000 }).toArray();
  const round = (value: number) => Math.round(value * 100) / 100;
  const stats = (row: Record<string, number>) => ({ requests: row.requests, nonReplayRequests: row.requests - row.replayed, replayed: row.replayed, ok: row.ok, rejected: row.rejected, errors: row.errors, handlerMs: round(row.handlerMs), settleMs: round(row.settleMs), commandMs: round(row.commandMs), attempts: row.attempts });
  type BatchActionRow={_id:{cityId:string;action:string};count:number};
  const batchActions:BatchActionRow[]=report.batchActions??[];
  const actionTotals=new Map<string,number>();
  for(const row of batchActions)actionTotals.set(row._id.action,(actionTotals.get(row._id.action)??0)+row.count);
  const playerRows = report.players.map((row: { _id: string } & Record<string, number>) => {
    const city = cities.find(c => String(c._id) === row._id), user = users.find(u => String(u._id) === city?.owner);
    return { player: user?.name ?? 'Không có tên', village: city?.name ?? 'Làng không còn tồn tại', ...stats(row),
      batchActions:batchActions.filter(a=>a._id.cityId===row._id).map(a=>({action:a._id.action,count:a.count})).sort((a,b)=>b.count-a.count) };
  });
  const playerCommands = cityIds.length ? await db.collection('online_command_stats').aggregate([
    { $match: { cityId: { $in: cityIds }, bucket: { $gte: from, $lte: to } } },
    { $group: { _id: { cityId: '$cityId', command: '$command' }, requests: { $sum: '$requests' }, replayed: { $sum: '$replayed' } } },
    { $sort: { requests: -1, '_id.command': 1 } },
  ], { maxTimeMS: 5000 }).toArray() : [];
  console.log(JSON.stringify({
    window: { from: from.toISOString(), to: to.toISOString(), bucketMinutes: 15, note: 'Window start rounded down to a 15-minute boundary. Counters start at deployment; no historical reconstruction. Timings are handler wall time and synchronous city simulation/command time, not billed CPU.' },
    coverage: report.coverage[0] ?? null,
    players: playerRows.map((row: object, index: number) => ({ ...row, commands: playerCommands.filter(c => c._id.cityId === cityIds[index]).map(c => ({ command: c._id.command, requests: c.requests, replayed: c.replayed })) })),
    commands: report.commands.map((row: { _id: string } & Record<string, number>) => ({ command: row._id, ...stats(row) })),
    batchActions:[...actionTotals].map(([action,count])=>({action,count})).sort((a,b)=>b.count-a.count),
    batchActionNote:'Child counts are commands durably processed once, including domain rejections. Requests and handler timing belong to the batch, not each child. Older deployments did not record child counters.',
  }, null, 2));
} catch (error) {
  // Connection errors can include a host/URI; do not dump credentials or payloads.
  console.error('Read-only command report failed:', error instanceof Error ? error.name : 'Unknown error');
  process.exitCode = 1;
} finally { await client.close(); }
