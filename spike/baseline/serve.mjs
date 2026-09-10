import { startFixture } from '../../test/fixture.mjs';
const f = await startFixture();
console.log(f.url);
process.on('SIGTERM', async () => { await f.close(); process.exit(0); });
setInterval(() => {}, 1 << 30);
