import {makeElement} from './html'

type Content = Array<string|HTMLElement>

export const em    =(...ss: Content)=>makeElement('em'    )()(...ss)
export const strong=(...ss: Content)=>makeElement('strong')()(...ss)
export const sup   =(...ss: Content)=>makeElement('sup'   )()(...ss)
export const dfn   =(...ss: Content)=>makeElement('dfn'   )()(...ss)
export const code  =(...ss: Content)=>makeElement('code'  )()(...ss)
export const mark  =(...ss: Content)=>makeElement('mark'  )()(...ss)
export const a     =(...ss: Content)=>makeElement('a'     )()(...ss)
export const p     =(...ss: Content)=>makeElement('p'     )()(...ss)
export const ul    =(...ss: Content)=>makeElement('ul'    )()(...ss)
export const ol    =(...ss: Content)=>makeElement('ol'    )()(...ss)
export const li    =(...ss: Content)=>makeElement('li'    )()(...ss)
