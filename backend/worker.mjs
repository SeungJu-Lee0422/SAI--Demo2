import {api} from './api.mjs';
import {remoteOptimizer} from './optimizer-remote.mjs';
export default {async fetch(req,env){return new URL(req.url).pathname==='/api/app'?api(req,{...env,optimizeGroups:remoteOptimizer(env)}):env.ASSETS.fetch(req);}};
