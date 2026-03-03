import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import { vi } from 'vitest';
import Ajv2020 from 'ajv/dist/2020';
import worker from '../src/index';
import councilArtifactsSchema from '../schemas/council-artifacts.schema.json';
import { validateSpecialistStance } from '../src/specialists/schemas';
import * as interactModule from '../src/specialists/interact';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;
const devUserAuthHeader = { 'cf-access-jwt-assertion': 'devuser-local-token' };
const serviceTokenHeaders = {
	'cf-access-client-id': 'service-id-local',
	'cf-access-client-secret': 'service-secret-local',
};

beforeAll(async () => {
	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS decisions (
			id TEXT PRIMARY KEY,
			goal TEXT NOT NULL,
			decision_json TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`
	).run();

	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS tasks (
			id TEXT PRIMARY KEY,
			decision_id TEXT NOT NULL,
			description TEXT NOT NULL,
			status TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			FOREIGN KEY (decision_id) REFERENCES decisions(id)
		)`
	).run();

	await env.DB.prepare(
		`CREATE TABLE IF NOT EXISTS runs (
			id TEXT PRIMARY KEY,
			request_id TEXT NOT NULL,
			route TEXT NOT NULL,
			ok INTEGER NOT NULL,
			error TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		)`
	).run();
});

describe('Consortium Kernel worker', () => {
	it('returns Slice 0 health payload at GET / (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('application/json');
		const payload = await response.json() as Record<string, unknown>;
		expect(payload.ok).toBe(true);
		expect(payload).toHaveProperty('ok');
		expect(payload).toHaveProperty('data');
		const data = payload.data as Record<string, unknown>;
		expect(data.service).toBe('consortium-kernel');
		expect(typeof payload.request_id).toBe('string');
	});

	it('returns Slice 0 health payload at GET / (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		expect(response.status).toBe(200);
		const payload = await response.json() as Record<string, unknown>;
		expect(payload.ok).toBe(true);
		expect(payload).toHaveProperty('ok');
		expect(payload).toHaveProperty('data');
		const data = payload.data as Record<string, unknown>;
		expect(data.service).toBe('consortium-kernel');
		expect(typeof payload.request_id).toBe('string');
	});

	it('serves room UI stub at GET /room (Slice 3.1)', async () => {
		const response = await SELF.fetch('https://example.com/room');
		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toContain('text/html');
		const page = await response.text();
		expect(page).toContain('Consortium Room');
		expect(page).toContain('Submit to /council');
		expect(page).toContain('Copy debug info');
		expect(page).not.toContain('cf-access-jwt-assertion');
	});

	it('denies protected route when auth secrets are missing and protection is enabled (Slice 3.2)', async () => {
		const request = new IncomingRequest('https://example.com/council', {
			method: 'GET',
			headers: serviceTokenHeaders,
		});
		const ctx = createExecutionContext();
		const misconfiguredEnv = {
			...env,
			DEVUSER_ACCESS_JWT: '',
		} as typeof env;

		const response = await worker.fetch(request, misconfiguredEnv, ctx);
		await waitOnExecutionContext(ctx);

		expect(response.status).toBe(403);
		const payload = await response.json() as Record<string, unknown>;
		expect(payload).toHaveProperty('ok');
		expect(payload.ok).toBe(false);
		expect(payload).toHaveProperty('error');
		expect(typeof payload.request_id).toBe('string');
		expect((payload.error as Record<string, unknown>).code).toBe('auth_misconfigured');
	});

	it('blocks unauthorized access to protected routes (Slice 3)', async () => {
		const postResponse = await SELF.fetch('https://example.com/council', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ goal: 'unauthorized attempt' }),
		});

		expect(postResponse.status).toBe(403);
		const postPayload = await postResponse.json() as Record<string, unknown>;
		expect(postPayload).toHaveProperty('ok');
		expect(postPayload.ok).toBe(false);
		expect(postPayload).toHaveProperty('error');
		expect(typeof postPayload.request_id).toBe('string');
		expect((postPayload.error as Record<string, unknown>).code).toBe('unauthorized');

		const readResponse = await SELF.fetch('https://example.com/decisions/not-a-real-id');
		expect(readResponse.status).toBe(403);
		const readPayload = await readResponse.json() as Record<string, unknown>;
		expect(readPayload).toHaveProperty('ok');
		expect(readPayload.ok).toBe(false);
		expect(readPayload).toHaveProperty('error');
		expect(typeof readPayload.request_id).toBe('string');
		expect((readPayload.error as Record<string, unknown>).code).toBe('unauthorized');
	});

	it('allows service token calls on protected routes (Slice 3)', async () => {
		const response = await SELF.fetch('https://example.com/council', {
			headers: serviceTokenHeaders,
		});

		expect(response.status).toBe(200);
		const payload = await response.json() as Record<string, unknown>;
		expect(payload).toHaveProperty('ok');
		expect(payload.ok).toBe(true);
		expect(payload).toHaveProperty('data');
		expect(typeof payload.request_id).toBe('string');
		const data = payload.data as Record<string, unknown>;
		expect(data.hint).toBe('POST {goal} to /council');
	});

	it('retrieves stored decision by id (Slice 2 integration)', async () => {
		const createResponse = await SELF.fetch('https://example.com/council', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...devUserAuthHeader },
			body: JSON.stringify({ goal: 'Slice 2 integration retrieval' }),
		});

		expect(createResponse.status).toBe(200);
		const created = await createResponse.json() as Record<string, unknown>;
		expect(created).toHaveProperty('ok');
		expect(created.ok).toBe(true);
		expect(created).toHaveProperty('data');
		expect(typeof created.request_id).toBe('string');
		const createData = created.data as Record<string, unknown>;
		const decisionId = String(createData.decision_id ?? '');
		expect(decisionId.length).toBeGreaterThan(0);
		const selectedSpecialists = createData.selected_specialists as Array<Record<string, unknown>>;
		expect(Array.isArray(selectedSpecialists)).toBe(true);
		expect(selectedSpecialists.length).toBeGreaterThan(0);
		expect(selectedSpecialists.some((specialist) => specialist.id === 'ARCHIVIST')).toBe(true);
		expect(createData.interaction_model).toBe('tiered');
		const stages = createData.stages as Array<Record<string, unknown>>;
		expect(Array.isArray(stages)).toBe(true);
		expect(stages.length).toBe(3);
		expect(stages.map((stage) => stage.stage)).toEqual(['propose', 'review', 'final']);
		const reviewStage = stages.find((stage) => stage.stage === 'review') as Record<string, unknown> | undefined;
		const finalStage = stages.find((stage) => stage.stage === 'final') as Record<string, unknown> | undefined;
		expect(Array.isArray(reviewStage?.required_changes)).toBe(true);
		expect(Array.isArray(finalStage?.satisfies_required_changes)).toBe(true);
		const requiredIds = ((reviewStage?.required_changes as Array<Record<string, unknown>> | undefined) ?? [])
			.map((item) => String(item.id ?? ''));
		const satisfiedIds = ((finalStage?.satisfies_required_changes as Array<unknown> | undefined) ?? [])
			.map((item) => String(item));
		for (const id of requiredIds) {
			expect(satisfiedIds.includes(id)).toBe(true);
		}
		const specialistStances = createData.specialist_stances as Array<unknown>;
		expect(Array.isArray(specialistStances)).toBe(true);
		expect(specialistStances.length).toBe(selectedSpecialists.length);
		for (const stance of specialistStances) {
			expect(validateSpecialistStance(stance)).toBe(true);
		}
		const quorum = createData.quorum as Array<Record<string, unknown>>;
		expect(Array.isArray(quorum)).toBe(true);
		expect(quorum.length).toBe(5);
		expect(quorum.some((stance) => stance.role === 'ARCHIVIST')).toBe(true);
		for (const stance of quorum) {
			expect(typeof stance.role).toBe('string');
			expect(typeof stance.stance).toBe('string');
			expect(Array.isArray(stance.risks)).toBe(true);
			expect(Array.isArray(stance.asks)).toBe(true);
			expect(Array.isArray(stance.proposed_changes)).toBe(true);
		}

		const ajv = new Ajv2020({ allErrors: true, strict: false });
		const validateArtifacts = ajv.compile(councilArtifactsSchema as object);
		const artifactsValid = validateArtifacts({
			interaction_model: createData.interaction_model,
			selected_specialists: createData.selected_specialists,
			specialist_stances: createData.specialist_stances,
			stages: createData.stages,
			quorum: createData.quorum,
			decision_card: createData.decision_card,
		});
		expect(artifactsValid, JSON.stringify(validateArtifacts.errors, null, 2)).toBe(true);

		const decisionCard = createData.decision_card as Record<string, unknown>;
		expect(Array.isArray(decisionCard.constraints)).toBe(true);
		expect(Array.isArray(decisionCard.plan)).toBe(true);
		expect(Array.isArray(decisionCard.acceptance_tests)).toBe(true);
		expect(Array.isArray(decisionCard.definition_of_done)).toBe(true);

		const createTasks = createData.tasks as Array<Record<string, unknown>>;
		expect(Array.isArray(createTasks)).toBe(true);
		expect(createTasks.length).toBe((decisionCard.plan as Array<unknown>).length);
		for (const task of createTasks) {
			expect(typeof task.description).toBe('string');
			expect(task.status).toBe('todo');
		}

		const createRunRow = await env.DB.prepare(
			"SELECT route, ok FROM runs WHERE request_id = ? LIMIT 1"
		)
			.bind(String(created.request_id))
			.first<{ route: string; ok: number }>();
		expect(createRunRow?.route).toBe('/council');
		expect(createRunRow?.ok).toBe(1);

		const readResponse = await SELF.fetch(`https://example.com/decisions/${decisionId}`, {
			headers: devUserAuthHeader,
		});
		expect(readResponse.status).toBe(200);

		const retrieved = await readResponse.json() as Record<string, unknown>;
		expect(retrieved).toHaveProperty('ok');
		expect(retrieved.ok).toBe(true);
		expect(retrieved).toHaveProperty('data');
		const retrievedData = retrieved.data as Record<string, unknown>;
		expect(retrievedData.decision_id).toBe(decisionId);
		const retrievedSelected = retrievedData.selected_specialists as Array<Record<string, unknown>>;
		expect(Array.isArray(retrievedSelected)).toBe(true);
		expect(retrievedSelected.length).toBeGreaterThan(0);
		expect(retrievedSelected.some((specialist) => specialist.id === 'ARCHIVIST')).toBe(true);
		const retrievedStances = retrievedData.specialist_stances as Array<unknown>;
		expect(Array.isArray(retrievedStances)).toBe(true);
		expect(retrievedStances.length).toBe(retrievedSelected.length);
		for (const stance of retrievedStances) {
			expect(validateSpecialistStance(stance)).toBe(true);
		}
		expect(retrievedData.interaction_model).toBe('tiered');
		const retrievedStages = retrievedData.stages as Array<Record<string, unknown>>;
		expect(Array.isArray(retrievedStages)).toBe(true);
		expect(retrievedStages.map((stage) => stage.stage)).toEqual(['propose', 'review', 'final']);
		expect(retrievedData.interaction_model).toBe(createData.interaction_model);
		expect(retrievedData.stages).toEqual(createData.stages);
		const retrievedQuorum = retrievedData.quorum as Array<Record<string, unknown>>;
		expect(Array.isArray(retrievedQuorum)).toBe(true);
		expect(retrievedQuorum.length).toBe(5);
		expect(retrievedQuorum.some((stance) => stance.role === 'ARCHIVIST')).toBe(true);
		const retrievedCard = retrievedData.decision_card as Record<string, unknown>;
		expect(Array.isArray(retrievedCard.constraints)).toBe(true);
		expect(Array.isArray(retrievedCard.plan)).toBe(true);
		expect(Array.isArray(retrievedCard.acceptance_tests)).toBe(true);
		expect(Array.isArray(retrievedCard.definition_of_done)).toBe(true);
		expect((retrievedCard.goal as string)).toBe('Slice 2 integration retrieval');
		expect(Array.isArray(retrievedData.tasks)).toBe(true);
		expect((retrievedData.tasks as unknown[]).length).toBe((createTasks as unknown[]).length);
		expect(typeof retrieved.request_id).toBe('string');

		const runRow = await env.DB.prepare(
			"SELECT route, ok FROM runs WHERE request_id = ? LIMIT 1"
		)
			.bind(String(retrieved.request_id))
			.first<{ route: string; ok: number }>();

		expect(runRow?.route).toBe('/decisions/:id');
		expect(runRow?.ok).toBe(1);
	});

	it('returns 404 for unknown decision id (Slice 2 integration)', async () => {
		const response = await SELF.fetch('https://example.com/decisions/not-a-real-id', {
			headers: devUserAuthHeader,
		});
		expect(response.status).toBe(404);

		const payload = await response.json() as Record<string, unknown>;
		expect(payload).toHaveProperty('ok');
		expect(payload.ok).toBe(false);
		expect(payload).toHaveProperty('error');
		expect((payload.error as Record<string, unknown>).code).toBe('not_found');
		expect((payload.error as Record<string, unknown>)).toHaveProperty('code');
		expect(typeof payload.request_id).toBe('string');

		const runRow = await env.DB.prepare(
			"SELECT route, ok, error FROM runs WHERE request_id = ? LIMIT 1"
		)
			.bind(String(payload.request_id))
			.first<{ route: string; ok: number; error: string | null }>();

		expect(runRow?.route).toBe('/decisions/:id');
		expect(runRow?.ok).toBe(0);
		expect(runRow?.error).toBe('not_found');
	});

	it('returns governance_unsatisfied when captain cannot satisfy required changes (negative path)', async () => {
		const tieredSpy = vi.spyOn(interactModule, 'runTieredCouncil').mockImplementation(async (goal, selected, quorum, decisionCard, _env) => ({
			interaction_model: 'tiered',
			selected_specialists: selected,
			specialist_stances: [],
			quorum,
			decision_card: decisionCard,
			stages: [
				{ stage: 'propose', specialists: ['ARCHITECT'], stances: [] },
				{
					stage: 'review',
					specialists: ['ARCHIVIST'],
					stances: [],
					required_changes: [
						{ id: 'RC-001', from_role: 'ARCHIVIST', type: 'artifact', statement: 'required change not satisfied' },
					],
				},
				{
					stage: 'final',
					specialists: ['CAPTAIN'],
					satisfies_required_changes: [],
					decision_card: decisionCard,
				},
			],
		}));

		const request = new IncomingRequest('https://example.com/council', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...devUserAuthHeader },
			body: JSON.stringify({ goal: 'force governance failure path' }),
		});
		const ctx = createExecutionContext();

		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		tieredSpy.mockRestore();

		expect(response.status).toBe(500);
		const payload = await response.json() as Record<string, unknown>;
		expect(payload.ok).toBe(false);
		expect((payload.error as Record<string, unknown>).code).toBe('governance_unsatisfied');
		expect(typeof payload.request_id).toBe('string');

		const runRow = await env.DB.prepare(
			"SELECT route, ok, error FROM runs WHERE request_id = ? LIMIT 1"
		)
			.bind(String(payload.request_id))
			.first<{ route: string; ok: number; error: string | null }>();

		expect(runRow?.route).toBe('/council');
		expect(runRow?.ok).toBe(0);
		expect(runRow?.error).toBe('governance_unsatisfied');
	});

	it('deterministically fails governance when RC evidence token is missing from plan', async () => {
		const tieredSpy = vi.spyOn(interactModule, 'runTieredCouncil').mockImplementation(async (
			_requestId,
			_goal,
			selected,
			quorum,
			decisionCard,
		) => {
			const required = [
				interactModule.normalizeRequiredChange({
					from_role: 'ARCHITECT',
					type: 'artifact',
					statement: 'Plan must include rate_limit for burst control',
					evidence_kind: 'plan_contains',
					evidence_match: 'rate_limit',
				}),
			];

			const { satisfiedIds } = interactModule.evaluateSatisfaction(required, decisionCard);

			return {
				interaction_model: 'tiered' as const,
				selected_specialists: selected,
				specialist_stances: [],
				quorum,
				decision_card: decisionCard,
				stages: [
					{ stage: 'propose' as const, specialists: ['CATALYST'], stances: [] },
					{
						stage: 'review' as const,
						specialists: ['ARCHITECT'],
						stances: [],
						required_changes: required.map(({ id, from_role, type, statement }) => ({ id, from_role, type, statement })),
					},
					{
						stage: 'final' as const,
						specialists: ['CAPTAIN'] as ['CAPTAIN'],
						satisfies_required_changes: satisfiedIds,
						decision_card: decisionCard,
					},
				],
			};
		});

		const response = await SELF.fetch('https://example.com/council', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...devUserAuthHeader },
			body: JSON.stringify({ goal: 'deterministic missing rate limit evidence' }),
		});

		tieredSpy.mockRestore();
		expect(response.status).toBe(500);
		const payload = await response.json() as Record<string, unknown>;
		expect(payload.ok).toBe(false);
		expect((payload.error as Record<string, unknown>).code).toBe('governance_unsatisfied');

		const runRow = await env.DB.prepare(
			"SELECT route, ok, error FROM runs WHERE request_id = ? LIMIT 1"
		)
			.bind(String(payload.request_id))
			.first<{ route: string; ok: number; error: string | null }>();

		expect(runRow?.route).toBe('/council');
		expect(runRow?.ok).toBe(0);
		expect(runRow?.error).toBe('governance_unsatisfied');
	});

	it('deterministically satisfies governance when RC evidence token exists in plan', async () => {
		const tieredSpy = vi.spyOn(interactModule, 'runTieredCouncil').mockImplementation(async (
			_requestId,
			_goal,
			selected,
			quorum,
			decisionCard,
		) => {
			const required = [
				interactModule.normalizeRequiredChange({
					from_role: 'ARCHITECT',
					type: 'artifact',
					statement: 'Plan must include rate_limit for burst control',
					evidence_kind: 'plan_contains',
					evidence_match: 'rate_limit',
				}),
			];

			const cardWithEvidence = {
				...decisionCard,
				plan: [...decisionCard.plan, 'Add rate_limit middleware for burst control'],
			};
			const { satisfiedIds } = interactModule.evaluateSatisfaction(required, cardWithEvidence);

			return {
				interaction_model: 'tiered' as const,
				selected_specialists: selected,
				specialist_stances: [],
				quorum,
				decision_card: cardWithEvidence,
				stages: [
					{ stage: 'propose' as const, specialists: ['CATALYST'], stances: [] },
					{
						stage: 'review' as const,
						specialists: ['ARCHITECT'],
						stances: [],
						required_changes: required.map(({ id, from_role, type, statement }) => ({ id, from_role, type, statement })),
					},
					{
						stage: 'final' as const,
						specialists: ['CAPTAIN'] as ['CAPTAIN'],
						satisfies_required_changes: satisfiedIds,
						decision_card: cardWithEvidence,
					},
				],
			};
		});

		const response = await SELF.fetch('https://example.com/council', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...devUserAuthHeader },
			body: JSON.stringify({ goal: 'deterministic satisfied rate limit evidence' }),
		});

		tieredSpy.mockRestore();
		expect(response.status).toBe(200);
		const payload = await response.json() as Record<string, unknown>;
		expect(payload.ok).toBe(true);
		const data = payload.data as Record<string, unknown>;
		const stages = data.stages as Array<Record<string, unknown>>;
		const finalStage = stages.find((stage) => stage.stage === 'final') as Record<string, unknown> | undefined;
		const satisfiedIds = (finalStage?.satisfies_required_changes as Array<unknown> | undefined) ?? [];
		expect(satisfiedIds.length).toBeGreaterThan(0);
	});

	it('adds Lore specialist when narrative triggers are present (Slice 4.1)', async () => {
		const createResponse = await SELF.fetch('https://example.com/council', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...devUserAuthHeader },
			body: JSON.stringify({ goal: 'Create narrative continuity for lore memory in this slice' }),
		});

		expect(createResponse.status).toBe(200);
		const payload = await createResponse.json() as Record<string, unknown>;
		expect(payload.ok).toBe(true);
		const data = payload.data as Record<string, unknown>;
		const selectedSpecialists = data.selected_specialists as Array<Record<string, unknown>>;
		expect(Array.isArray(selectedSpecialists)).toBe(true);
		expect(selectedSpecialists.some((specialist) => specialist.id === 'ARCHIVIST')).toBe(true);
		expect(selectedSpecialists.some((specialist) => specialist.id === 'NARRATIVE')).toBe(true);
		expect(data.interaction_model).toBe('tiered');
		const stages = data.stages as Array<Record<string, unknown>>;
		expect(Array.isArray(stages)).toBe(true);
		expect(stages.map((stage) => stage.stage)).toEqual(['propose', 'review', 'final']);
		const reviewStage = stages.find((stage) => stage.stage === 'review') as Record<string, unknown> | undefined;
		const finalStage = stages.find((stage) => stage.stage === 'final') as Record<string, unknown> | undefined;
		const requiredIds = ((reviewStage?.required_changes as Array<Record<string, unknown>> | undefined) ?? [])
			.map((item) => String(item.id ?? ''));
		const satisfiedIds = ((finalStage?.satisfies_required_changes as Array<unknown> | undefined) ?? [])
			.map((item) => String(item));
		for (const id of requiredIds) {
			expect(satisfiedIds.includes(id)).toBe(true);
		}

		const specialistStances = data.specialist_stances as Array<unknown>;
		expect(Array.isArray(specialistStances)).toBe(true);
		expect(specialistStances.length).toBe(selectedSpecialists.length);
		for (const stance of specialistStances) {
			expect(validateSpecialistStance(stance)).toBe(true);
		}

		const runRow = await env.DB.prepare(
			"SELECT route, ok FROM runs WHERE request_id = ? LIMIT 1"
		)
			.bind(String(payload.request_id))
			.first<{ route: string; ok: number }>();

		expect(runRow?.route).toBe('/council');
		expect(runRow?.ok).toBe(1);
	});

	it('enforces specialist trigger coverage at /council with tiered stage invariants', async () => {
		const triggerCases = [
			{ goal: 'plot arc outline', expected: 'AURORA' },
			{ goal: 'dialogue monologue script', expected: 'VOX_FORGE' },
			{ goal: 'visual palette moodboard', expected: 'GLYPH' },
			{ goal: 'soundtrack sfx score', expected: 'RHYTHM' },
			{ goal: 'map environment location', expected: 'TERRA' },
			{ goal: 'xp reward loop progression', expected: 'PULSE' },
			{ goal: 'ui ux flow layout', expected: 'SPECTRA' },
			{ goal: 'branching reactive state machine', expected: 'HERMES' },
			{ goal: 'brainstorm alternatives strategy', expected: 'CATALYST' },
		];

		for (const testCase of triggerCases) {
			const response = await SELF.fetch('https://example.com/council', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...devUserAuthHeader },
				body: JSON.stringify({ goal: testCase.goal }),
			});

			expect(response.status).toBe(200);
			const payload = await response.json() as Record<string, unknown>;
			expect(payload.ok).toBe(true);

			const data = payload.data as Record<string, unknown>;
			const selectedSpecialists = data.selected_specialists as Array<Record<string, unknown>>;
			expect(Array.isArray(selectedSpecialists)).toBe(true);
			expect(selectedSpecialists.some((specialist) => specialist.id === testCase.expected)).toBe(true);
			expect(selectedSpecialists.some((specialist) => specialist.id === 'ARCHIVIST')).toBe(true);

			expect(data.interaction_model).toBe('tiered');
			const stages = data.stages as Array<Record<string, unknown>>;
			expect(Array.isArray(stages)).toBe(true);
			expect(stages.map((stage) => stage.stage)).toEqual(['propose', 'review', 'final']);
		}
	});

	it('applies fallback propose specialist for vague goals and keeps governance present', async () => {
		const response = await SELF.fetch('https://example.com/council', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...devUserAuthHeader },
			body: JSON.stringify({ goal: 'do the thing' }),
		});

		expect(response.status).toBe(200);
		const payload = await response.json() as Record<string, unknown>;
		expect(payload.ok).toBe(true);

		const data = payload.data as Record<string, unknown>;
		const selectedSpecialists = data.selected_specialists as Array<Record<string, unknown>>;
		expect(selectedSpecialists.some((specialist) => specialist.id === 'ARCHIVIST')).toBe(true);

		expect(data.interaction_model).toBe('tiered');
		const stages = data.stages as Array<Record<string, unknown>>;
		expect(stages.map((stage) => stage.stage)).toEqual(['propose', 'review', 'final']);

		const proposeStage = stages.find((stage) => stage.stage === 'propose') as Record<string, unknown>;
		const reviewStage = stages.find((stage) => stage.stage === 'review') as Record<string, unknown>;

		expect(Array.isArray(proposeStage.specialists)).toBe(true);
		expect((proposeStage.specialists as Array<unknown>).includes('CATALYST')).toBe(true);

		expect(Array.isArray(reviewStage.specialists)).toBe(true);
		expect((reviewStage.specialists as Array<unknown>).includes('ARCHIVIST')).toBe(true);
	});

	it('keeps specialist selection deterministic across case, whitespace, and punctuation variants', async () => {
		const variants = [
			'design ui flow for relic generator',
			'DESIGN UI FLOW FOR RELIC GENERATOR',
			'design   ui   flow   for relic generator',
			'design, ui-flow; for relic generator!!!',
		];

		let baseline: string[] | null = null;

		for (const goal of variants) {
			const response = await SELF.fetch('https://example.com/council', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...devUserAuthHeader },
				body: JSON.stringify({ goal }),
			});

			expect(response.status).toBe(200);
			const payload = await response.json() as Record<string, unknown>;
			expect(payload.ok).toBe(true);
			const data = payload.data as Record<string, unknown>;
			const selectedSpecialists = data.selected_specialists as Array<Record<string, unknown>>;
			const ids = selectedSpecialists
				.map((specialist) => String(specialist.id ?? ''))
				.sort();

			if (!baseline) {
				baseline = ids;
			} else {
				expect(ids).toEqual(baseline);
			}
		}
	});

	it('maintains golden artifact snapshot for representative specialist selection goal', async () => {
		const response = await SELF.fetch('https://example.com/council', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...devUserAuthHeader },
			body: JSON.stringify({ goal: 'design ui flow for relic generator' }),
		});

		expect(response.status).toBe(200);
		const payload = await response.json() as Record<string, unknown>;
		expect(payload.ok).toBe(true);

		const data = payload.data as Record<string, unknown>;
		const selectedSpecialists = data.selected_specialists as Array<Record<string, unknown>>;
		const selectedIds = selectedSpecialists
			.map((specialist) => String(specialist.id ?? ''))
			.sort();
		expect(selectedIds).toEqual(['ARCHIVIST', 'NARRATIVE', 'SPECTRA']);

		const stages = data.stages as Array<Record<string, unknown>>;
		const reviewStage = stages.find((stage) => stage.stage === 'review') as Record<string, unknown> | undefined;
		const requiredChanges = (reviewStage?.required_changes as Array<Record<string, unknown>> | undefined) ?? [];
		for (const change of requiredChanges) {
			expect(String(change.id ?? '')).toMatch(/^RC-[0-9]{3,}$/);
		}

		const decisionCard = data.decision_card as Record<string, unknown>;
		expect(decisionCard).toHaveProperty('goal');
		expect(decisionCard).toHaveProperty('constraints');
		expect(decisionCard).toHaveProperty('plan');
		expect(decisionCard).toHaveProperty('acceptance_tests');
		expect(decisionCard).toHaveProperty('definition_of_done');
	});
});
