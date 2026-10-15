export { violationSignature } from "../gate/index.js";
export { formatSectionBlock } from "./block.js";
export {
	composePrBody,
	PR_FIELDS,
	type PrFields,
	readPrFields,
	reviseFields,
} from "./compose.js";
export {
	detectSectionViolations,
	type SectionViolation,
} from "./detect.js";
export {
	type BodyViolation,
	detectBodyViolations,
	formatBodyBlock,
	type SectionGateConfig,
	type SectionGateDecision,
	sectionGateDecision,
} from "./gate.js";
export { ISSUE_SECTIONS, PR_SECTIONS, PR_SHAPE } from "./sanctioned.js";
export {
	type BodyShape,
	countWords,
	detectShapeViolations,
	type SectionShape,
	type ShapeRule,
	type ShapeViolation,
	sentencesOf,
} from "./shape.js";
export { formatShapeBlock } from "./shape-block.js";
