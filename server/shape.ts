// Shape of a cached simulation result. No Node imports: the browser uses this check too.

/** a stored simulation result as the app writes it (useSimulation.ts); also used by the client */
export function isResultEntry(o: any): boolean {
  const st = o?.stats, su = o?.setup, sc = su?.scenario;
  const players = sc?.players;
  return !!st && typeof st.games === 'number' && Array.isArray(st.wins) && Array.isArray(st.ci) && Array.isArray(st.rounds)
    && Array.isArray(st.bankruptBy) && Array.isArray(st.samples) && Array.isArray(st.trajectories)
    && !!su && typeof su.editionId === 'string' && Array.isArray(su.houseRules) && Array.isArray(su.profiles)
    && typeof su.games === 'number' && typeof su.seed === 'number'
    && !!sc && Array.isArray(players) && players.length >= 2 && players.length <= 6
    && st.wins.length === players.length && su.profiles.length === players.length && Array.isArray(sc.properties);
}
