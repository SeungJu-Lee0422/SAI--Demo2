import {api} from './api.mjs';
export default {async fetch(req,env){return new URL(req.url).pathname.startsWith('/api/')?api(req,env):env.ASSETS.fetch(req);}};
