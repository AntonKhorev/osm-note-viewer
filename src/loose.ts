export type LooseParseType = 'note'|'changeset'|'node'|'way'|'relation'|undefined

export default function parseLoose(text: string): [id: number, type: LooseParseType] | null {
	const match=text.match(/([0-9]+)\s*$/)
	if (!match) return null
	const [,idString]=match
	return [Number(idString),undefined]
}
