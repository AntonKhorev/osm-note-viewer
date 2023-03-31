import {OsmChangesetApiData} from '../osm'

export function findClosingChangesetId(targetTimestamp: number, changesets: OsmChangesetApiData[]): number|undefined {
	let id: number|undefined
	let distance=Infinity
	for (const changeset of changesets) {
		if (changeset.closed_at==null) continue
		const changesetTimestamp=Date.parse(changeset.closed_at)/1000
		const changesetDistance=(changesetTimestamp>targetTimestamp
			? (changesetTimestamp-targetTimestamp)*3
			: (targetTimestamp-changesetTimestamp)
		)
		if (changesetDistance<distance) {
			distance=changesetDistance
			id=changeset.id
		}
	}
	return id
}
