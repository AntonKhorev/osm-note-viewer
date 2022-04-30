export type LooseParseType = 'note'|'changeset'|'node'|'way'|'relation'|undefined

export default function parseLoose(text: string): [id: number, type: LooseParseType] | null {
	const match=text.match(/^(.*?)([0-9]+)\s*$/)
	if (!match) return null
	const [,prefix,idString]=match
	return [Number(idString),getType(prefix)]
}

function getType(text: string): LooseParseType {
	if (text.toLowerCase().includes('changeset')) return 'changeset'
	return undefined
}
