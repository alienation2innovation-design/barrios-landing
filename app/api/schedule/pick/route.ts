import { createNexusApiProxy } from '../../../../lib/nexus/trusted-link-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;
export const POST = createNexusApiProxy('/api/schedule/pick', 512);
