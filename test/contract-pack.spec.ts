import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import contractPackSchema from '../schemas/contract-pack.schema.json';
import decisionsGetByIdPack from '../schemas/contract-packs/decisions.getbyid.contract-pack.json';
import councilPostPack from '../schemas/contract-packs/council.post.contract-pack.json';
import specialistsRegistrySchema from '../schemas/specialists.registry.schema.v1.json';
import specialistsRegistry from '../schemas/specialists/specialists.v1.json';
import { validateSpecialistsRegistryInvariants, type SpecialistEntry } from '../src/specialists/select';

describe('Contract Packs (Slice 2.1)', () => {
	it('validates decisions.getbyid contract pack against canonical schema', () => {
		const ajv = new Ajv2020({ allErrors: true, strict: false });
		const validate = ajv.compile(contractPackSchema as object);
		const valid = validate(decisionsGetByIdPack);

		expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
	});

	it('validates council.post contract pack against canonical schema', () => {
		const ajv = new Ajv2020({ allErrors: true, strict: false });
		const validate = ajv.compile(contractPackSchema as object);
		const valid = validate(councilPostPack);

		expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
	});

	it('validates specialists registry against specialists registry schema', () => {
		const ajv = new Ajv2020({ allErrors: true, strict: false });
		const validate = ajv.compile(specialistsRegistrySchema as object);
		const valid = validate(specialistsRegistry);

		expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
	});

	it('enforces specialists registry runtime invariants', () => {
		const entries = (specialistsRegistry.specialists ?? []) as SpecialistEntry[];
		expect(() => validateSpecialistsRegistryInvariants(entries)).not.toThrow();

		const duplicate = [
			...JSON.parse(JSON.stringify(entries)) as SpecialistEntry[],
			JSON.parse(JSON.stringify(entries[0])) as SpecialistEntry,
		] as SpecialistEntry[];
		expect(() => validateSpecialistsRegistryInvariants(duplicate)).toThrow(/duplicate_id/i);

		const emptyKeyword = JSON.parse(JSON.stringify(entries)) as SpecialistEntry[];
		const keywordTarget = emptyKeyword.find((entry) => entry.selection_rule.kind === 'keyword');
		expect(keywordTarget).toBeTruthy();
		if (keywordTarget && keywordTarget.selection_rule.kind === 'keyword') {
			keywordTarget.selection_rule = {
				...keywordTarget.selection_rule,
				keywords: ['   '],
			};
		}
		expect(() => validateSpecialistsRegistryInvariants(emptyKeyword)).toThrow(/empty_keyword/i);

		const oversizedKeywords = JSON.parse(JSON.stringify(entries)) as SpecialistEntry[];
		const oversizedTarget = oversizedKeywords.find((entry) => entry.selection_rule.kind === 'keyword');
		expect(oversizedTarget).toBeTruthy();
		if (oversizedTarget && oversizedTarget.selection_rule.kind === 'keyword') {
			oversizedTarget.selection_rule = {
				...oversizedTarget.selection_rule,
				keywords: Array.from({ length: 51 }, (_, index) => `k${index}`),
			};
		}
		expect(() => validateSpecialistsRegistryInvariants(oversizedKeywords)).toThrow(/keyword_limit/i);
	});
});
