import {spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';

const projectSolver=resolve('.data/solver-env',process.platform==='win32'?'Scripts/python.exe':'bin/python');
const solverPython=process.env.SAI_SOLVER_PYTHON||(existsSync(projectSolver)?projectSolver:'');
const testEnv={...process.env,...(solverPython?{SAI_SOLVER_PYTHON:solverPython,SAI_PYTHON:process.env.SAI_PYTHON||solverPython}:{})};
const tests=['auth','preferences','taste-extraction','grouping','service-presentation','avatar','onboarding-links','source-ingestion','linkedin-preview','interest-profile','optimizer','optimizer-remote','demo-data','demo-api'];
for(const name of tests){
 const result=spawnSync(process.execPath,[`backend/${name}-smoke.mjs`],{stdio:'inherit',env:testEnv});
 if(result.status!==0)process.exit(result.status||1);
}
