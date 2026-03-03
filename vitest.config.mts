import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				miniflare: {
					bindings: {
						USE_MOCK_SPECIALISTS: 'true',
						USE_LIVE_SPECIALISTS: 'false',
					},
				},
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
	},
});
