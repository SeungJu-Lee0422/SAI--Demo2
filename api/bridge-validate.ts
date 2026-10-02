import {createBridgeValidatorHandler} from '../backend/vercel-bridge-validator.mjs';

export const fetch=createBridgeValidatorHandler(process.env);
export const handler=fetch;
export default {fetch};
