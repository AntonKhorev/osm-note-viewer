type ConcreteLooseParseType = 'note'|'changeset'|'node'|'way'|'relation'
export type LooseParseType = ConcreteLooseParseType|undefined

export default function parseLoose(text: string): [id: number, type: LooseParseType] | null {
	const match=text.match(/^(.*?)([0-9]+)\s*$/s)
	if (!match) return null
	const [,prefix,idString]=match
	return [Number(idString),getType(prefix)]
}

function getType(text: string): LooseParseType {
	const types: ConcreteLooseParseType[] = ['note','changeset','node','way','relation']
	let bestType: LooseParseType = undefined
	let bestIndex: number = -1
	const lowercaseText=text.toLowerCase()
	for (const type of types) {
		const index=lowercaseText.lastIndexOf(type)
		if (index>bestIndex) {
			bestIndex=index
			bestType=type
		}
	}
	return bestType
}
